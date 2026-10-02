"""
Database side of the flowsheet template CSV upload/download.

``apply_flowsheet_import`` turns the output of
``flowsheet_template_csv.parse_flowsheet_csv`` into FlowsheetTemplate /
FlowsheetRowDefinition / Dictionary / DictionaryItem rows, following the same
rules as the flowsheet-builder editor (FlowsheetTemplateAdminSerializer):

* row order = row order in the file (sort_order = index * 10)
* rows missing from the upload are removed from the flowsheet
* the template ``version`` is bumped when a row is added, removed, retyped, or
  its dropdown options change. Label, unit, section, option labels and pure
  reordering are cosmetic and do not bump it.
* charted flowsheets are not rewritten: their values are stored under the row
  keys, so a value for a removed row is simply no longer shown.

Dropdown options follow the note-template import's rules: rows in one upload
with an identical option list share one Dictionary; an existing row keeps its
Dictionary when the options are unchanged; changed options edit the
Dictionary in place only when nothing outside this upload uses it, otherwise
a new Dictionary is created so a shared list is never altered behind someone
else's back.
"""

from collections import OrderedDict

from django.db import transaction

from .flowsheet_template_csv import build_csv_text
from .models import Dictionary, DictionaryItem, FlowsheetRowDefinition, FlowsheetTemplate
from .note_template_import import _items_of, _sync_items, _unique_dictionary_code


def _only_used_by(dictionary, template, keys):
    """True if nothing except the given rows of `template` references `dictionary`."""
    for rel in Dictionary._meta.related_objects:
        if rel.related_model is DictionaryItem:
            continue
        qs = rel.related_model.objects.filter(**{rel.field.name: dictionary})
        if rel.related_model is FlowsheetRowDefinition:
            qs = qs.exclude(template=template, key__in=keys)
        if qs.exists():
            return False
    return True


def _resolve_dictionary(template, template_name, group_rows, options, existing_rows):
    keys = {r["key"] for r in group_rows}
    candidates = []
    for r in group_rows:
        ex = existing_rows.get(r["key"])
        if ex is not None and ex.dictionary_id and ex.dictionary not in candidates:
            candidates.append(ex.dictionary)

    # 1. An existing dictionary that already has exactly these options.
    for d in candidates:
        if _items_of(d) == options:
            return d
    # 2. An existing dictionary used by nothing but these rows: edit in place.
    for d in candidates:
        if _only_used_by(d, template, keys):
            _sync_items(d, options)
            return d
    # 3. Otherwise a brand new dictionary.
    first = group_rows[0]
    code = _unique_dictionary_code(f"{template.code}_{first['key']}")
    d = Dictionary.objects.create(code=code, name=f"{template_name} - {first['label']}"[:128])
    _sync_items(d, options)
    return d


def _signature_existing(template):
    sigs = set()
    for r in template.rows.select_related("dictionary"):
        values = frozenset(v for v, _ in _items_of(r.dictionary)) if r.dictionary_id else None
        sigs.add((r.key, r.field_type, values))
    return sigs


def _signature_incoming(rows):
    return {
        (r["key"], r["field_type"], frozenset(v for v, _ in r["options"]) if r["options"] else None)
        for r in rows
    }


@transaction.atomic
def apply_flowsheet_import(parsed):
    """
    Create or update the flowsheet described by `parsed` (see
    flowsheet_template_csv.parse_flowsheet_csv). Returns
    ``{"template": FlowsheetTemplate, "created": bool, "version_bumped": bool}``.
    All-or-nothing: any exception rolls everything back.
    """
    code, name, rows = parsed["code"], parsed["name"], parsed["rows"]

    template = FlowsheetTemplate.objects.filter(code=code).first()
    created = template is None
    if created:
        template = FlowsheetTemplate.objects.create(code=code, name=name)
        existing_rows = {}
        before = set()
    else:
        existing_rows = {r.key: r for r in template.rows.select_related("dictionary")}
        before = _signature_existing(template)
        template.name = name

    # Dictionaries: one per distinct option list in this upload.
    groups = OrderedDict()
    for r in rows:
        if r["options"]:
            groups.setdefault(tuple(r["options"]), []).append(r)
    dictionary_for = {}
    for options_tuple, group in groups.items():
        d = _resolve_dictionary(template, name, group, list(options_tuple), existing_rows)
        for r in group:
            dictionary_for[r["key"]] = d

    seen_ids = set()
    for idx, r in enumerate(rows):
        common = dict(
            section_label=r["section_label"],
            label=r["label"],
            unit=r["unit"],
            field_type=r["field_type"],
            dictionary=dictionary_for.get(r["key"]),
            sort_order=idx * 10,
        )
        ex = existing_rows.get(r["key"])
        if ex is not None:
            FlowsheetRowDefinition.objects.filter(id=ex.id).update(**common)
            seen_ids.add(ex.id)
        else:
            seen_ids.add(FlowsheetRowDefinition.objects.create(template=template, key=r["key"], **common).id)

    # Rows that were on the flowsheet but are not in the file are removed.
    template.rows.exclude(id__in=seen_ids).delete()

    version_bumped = False
    if not created and before != _signature_incoming(rows):
        template.version += 1
        version_bumped = True
    template.save()
    return {"template": template, "created": created, "version_bumped": version_bumped}


def export_flowsheet_csv(template):
    """CSV text for an existing FlowsheetTemplate. Raises ValueError if an option can't be represented."""
    rows = []
    for r in template.rows.select_related("dictionary").order_by("sort_order", "id"):
        rows.append(
            {
                "section_label": r.section_label,
                "key": r.key,
                "label": r.label,
                "unit": r.unit,
                "field_type": r.field_type,
                "options": _items_of(r.dictionary) if r.dictionary_id else None,
            }
        )
    return build_csv_text(template.code, template.name, rows)

"""
Database side of the note template CSV upload/download.

``apply_template_import`` turns the output of
``note_template_csv.parse_template_csv`` into NoteTemplate /
NoteFieldDefinition / Dictionary / DictionaryItem rows, following the same
rules as the note-builder editor (NoteTemplateAdminSerializer):

* field order = row order (sort_order = index * 10)
* fields missing from the upload are removed from the template
* the template ``version`` is bumped when a field is added, removed,
  retyped, re-pointed at different options, or its required / Depends on
  logic changes. Label, help text, tab, section, option labels and pure
  reordering are cosmetic and do not bump it.
* signed notes are never affected -- they render from their own frozen
  ClinicalNote.template_snapshot.

Options: fields in one upload that share an identical option list share one
Dictionary. An existing field keeps its current Dictionary when the options
are unchanged; if they changed, the Dictionary is edited in place only when
nothing outside this upload uses it (another template or a flowsheet row),
otherwise a new Dictionary is created so shared lists are never altered
behind someone else's back.
"""

from collections import OrderedDict

from django.db import transaction

from .models import Dictionary, DictionaryItem, NoteFieldDefinition, NoteTemplate
from .note_template_csv import build_csv_text


def _items_of(dictionary):
    return [(i.value, i.label) for i in dictionary.items.all().order_by("sort_order", "label", "id")]


def _only_used_by(dictionary, template, keys):
    """True if nothing except the given fields of `template` references `dictionary`."""
    for rel in Dictionary._meta.related_objects:
        if rel.related_model is DictionaryItem:
            continue
        qs = rel.related_model.objects.filter(**{rel.field.name: dictionary})
        if rel.related_model is NoteFieldDefinition:
            qs = qs.exclude(template=template, key__in=keys)
        if qs.exists():
            return False
    return True


def _sync_items(dictionary, options):
    existing = {i.value: i for i in dictionary.items.all()}
    wanted = {v for v, _ in options}
    for order, (value, label) in enumerate(options):
        item = existing.get(value)
        if item:
            if item.label != label or item.sort_order != order:
                item.label, item.sort_order = label, order
                item.save(update_fields=["label", "sort_order"])
        else:
            DictionaryItem.objects.create(dictionary=dictionary, value=value, label=label, sort_order=order)
    for value, item in existing.items():
        if value not in wanted:
            item.delete()


def _unique_dictionary_code(base):
    base = base[:64]
    if not Dictionary.objects.filter(code=base).exists():
        return base
    n = 2
    while True:
        suffix = f"_{n}"
        candidate = base[: 64 - len(suffix)] + suffix
        if not Dictionary.objects.filter(code=candidate).exists():
            return candidate
        n += 1


def _resolve_dictionary(template, template_name, group_fields, options, existing_fields):
    keys = {f["key"] for f in group_fields}
    candidates = []
    for f in group_fields:
        ex = existing_fields.get(f["key"])
        if ex is not None and ex.dictionary_id and ex.dictionary not in candidates:
            candidates.append(ex.dictionary)

    # 1. An existing dictionary that already has exactly these options.
    for d in candidates:
        if _items_of(d) == options:
            return d
    # 2. An existing dictionary used by nothing but these fields: edit in place.
    for d in candidates:
        if _only_used_by(d, template, keys):
            _sync_items(d, options)
            return d
    # 3. Otherwise a brand new dictionary.
    first = group_fields[0]
    code = _unique_dictionary_code(f"{template.code}_{first['key']}")
    d = Dictionary.objects.create(code=code, name=f"{template_name} - {first['label']}"[:128])
    _sync_items(d, options)
    return d


def _signature_set_existing(template):
    sigs = set()
    for f in template.fields.select_related("dictionary", "depends_on"):
        values = frozenset(v for v, _ in _items_of(f.dictionary)) if f.dictionary_id else None
        sigs.add((f.key, f.field_type, values, bool(f.required),
                  f.depends_on.key if f.depends_on_id else None, f.depends_on_value or ""))
    return sigs


def _signature_set_incoming(fields):
    sigs = set()
    for f in fields:
        values = frozenset(v for v, _ in f["options"]) if f["options"] else None
        sigs.add((f["key"], f["field_type"], values, bool(f["required"]),
                  f["depends_on_key"], f["depends_on_value"] or ""))
    return sigs


@transaction.atomic
def apply_template_import(parsed):
    """
    Create or update the template described by `parsed` (see
    note_template_csv.parse_template_csv). Returns
    ``{"template": NoteTemplate, "created": bool, "version_bumped": bool}``.
    All-or-nothing: any exception rolls everything back.
    """
    code, name, fields = parsed["code"], parsed["name"], parsed["fields"]

    template = NoteTemplate.objects.filter(code=code).first()
    created = template is None
    if created:
        template = NoteTemplate.objects.create(code=code, name=name)
        existing_fields = {}
        before = set()
    else:
        existing_fields = {f.key: f for f in template.fields.select_related("dictionary")}
        before = _signature_set_existing(template)
        template.name = name

    # Dictionaries: one per distinct option list in this upload.
    groups = OrderedDict()
    for f in fields:
        if f["options"]:
            groups.setdefault(tuple(f["options"]), []).append(f)
    dictionary_for = {}
    for options_tuple, group in groups.items():
        d = _resolve_dictionary(template, name, group, list(options_tuple), existing_fields)
        for f in group:
            dictionary_for[f["key"]] = d

    # Pass 1: create/update every field (without depends_on).
    pk_by_key, seen_ids = {}, set()
    for idx, f in enumerate(fields):
        common = dict(
            tab_label=f["tab_label"],
            section_label=f["section_label"],
            label=f["label"],
            field_type=f["field_type"],
            dictionary=dictionary_for.get(f["key"]),
            required=f["required"],
            sort_order=idx * 10,
            help_text=f["help_text"],
            depends_on_value=f["depends_on_value"],
        )
        ex = existing_fields.get(f["key"])
        if ex is not None:
            NoteFieldDefinition.objects.filter(id=ex.id).update(**common)
            pk_by_key[f["key"]] = ex.id
        else:
            pk_by_key[f["key"]] = NoteFieldDefinition.objects.create(template=template, key=f["key"], **common).id
        seen_ids.add(pk_by_key[f["key"]])

    # Fields that were on the template but are not in the file are removed.
    template.fields.exclude(id__in=seen_ids).delete()

    # Pass 2: wire up Depends on (every key now has a pk).
    for f in fields:
        NoteFieldDefinition.objects.filter(id=pk_by_key[f["key"]]).update(
            depends_on_id=pk_by_key[f["depends_on_key"]] if f["depends_on_key"] else None
        )

    version_bumped = False
    if not created and before != _signature_set_incoming(fields):
        template.version += 1
        version_bumped = True
    template.save()
    return {"template": template, "created": created, "version_bumped": version_bumped}


def export_template_csv(template):
    """CSV text for an existing NoteTemplate. Raises ValueError if an option can't be represented."""
    rows = []
    for f in template.fields.select_related("dictionary", "depends_on").order_by("sort_order", "id"):
        rows.append(
            {
                "tab_label": f.tab_label,
                "section_label": f.section_label,
                "key": f.key,
                "label": f.label,
                "field_type": f.field_type,
                "required": f.required,
                "help_text": f.help_text,
                "depends_on_key": f.depends_on.key if f.depends_on_id else None,
                "depends_on_value": f.depends_on_value,
                "options": _items_of(f.dictionary) if f.dictionary_id else None,
            }
        )
    return build_csv_text(template.code, template.name, rows)

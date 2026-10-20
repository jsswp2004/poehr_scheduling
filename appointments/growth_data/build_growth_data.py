"""Rebuild the growth reference JSON files in this folder from the published tables.

Run from the project folder:  python appointments/growth_data/build_growth_data.py

Sources (see SOURCES.md): CDC LMS tables (cdc.gov) for ages 2 to 20 years, and the WHO Child Growth Standards
L, M, S tables as published in WHO's own open-source `anthro` package, kept to birth through 24 months.
Each output file is {"1": [[key, L, M, S], ...], "2": [...]} where 1 is male and 2 is female.
"""
import csv
import io
import json
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CDC = "https://www.cdc.gov/growthcharts/data/zscore/{}.csv"
WHO = "https://raw.githubusercontent.com/WorldHealthOrganization/anthro/master/data-raw/growthstandards/{}.txt"
MAX_DAY = 731  # 24 months


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read().decode("utf-8-sig")


def r(value):
    return round(float(value), 6)


def cdc(name, out):
    table = {"1": [], "2": []}
    for row in csv.DictReader(io.StringIO(fetch(CDC.format(name)))):
        if not str(row["Sex"]).strip().isdigit():
            continue  # a repeated header or a footnote line
        table[str(int(row["Sex"]))].append([float(row["Agemos"]), r(row["L"]), r(row["M"]), r(row["S"])])
    write(out, table)


def who(name, key, out, limit=None):
    table = {"1": [], "2": []}
    lines = fetch(WHO.format(name)).splitlines()
    head = lines[0].split("\t")
    for line in lines[1:]:
        cells = dict(zip(head, line.split("\t")))
        k = float(cells[key])
        if limit is not None and k > limit:
            continue
        table[str(int(cells["sex"]))].append([k, r(cells["l"]), r(cells["m"]), r(cells["s"])])
    write(out, table)


def write(name, table):
    with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as handle:
        json.dump(table, handle, separators=(",", ":"))
    print(name, {sex: len(rows) for sex, rows in table.items()})


if __name__ == "__main__":
    cdc("wtage", "cdc_weight_for_age.json")
    cdc("statage", "cdc_stature_for_age.json")
    cdc("bmiagerev", "cdc_bmi_for_age.json")
    who("weianthro", "age", "who_weight_for_age.json", MAX_DAY)
    who("lenanthro", "age", "who_length_for_age.json", MAX_DAY)
    who("hcanthro", "age", "who_head_circumference.json", MAX_DAY)
    who("wflanthro", "length", "who_weight_for_length.json")

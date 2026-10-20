# Growth reference data: where it comes from

Rebuild with `python appointments/growth_data/build_growth_data.py` (needs internet). Files are {"1": male rows, "2": female rows}, each row [key, L, M, S].

- `cdc_weight_for_age.json`, `cdc_stature_for_age.json`, `cdc_bmi_for_age.json`: CDC growth chart LMS tables for ages 2 to 20 years (key = age in months, half-month steps), https://www.cdc.gov/growthcharts/cdc-data-files.htm (files wtage.csv, statage.csv, bmiagerev.csv). CDC data is public.
- `who_weight_for_age.json`, `who_length_for_age.json`, `who_head_circumference.json`: WHO Child Growth Standards LMS tables, key = age in days, birth to 730 days (24 months), recumbent length. Taken from the tables WHO publishes in its open-source `anthro` package (https://github.com/WorldHealthOrganization/anthro, data-raw/growthstandards/weianthro.txt, lenanthro.txt, hcanthro.txt).
- `who_weight_for_length.json`: WHO weight-for-length, key = recumbent length in cm (45 to 110, 0.1 steps), from `wflanthro.txt` in the same package.

z-score = ((value / M) ^ L - 1) / (L * S), or ln(value / M) / S when L is 0. Between table rows L, M and S are interpolated linearly. No "modified" z-score is applied beyond +/-3 SD, so extreme values are shown as plain LMS z-scores.

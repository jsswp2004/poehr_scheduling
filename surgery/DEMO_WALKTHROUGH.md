# Surgery module: browser walkthrough

A 30-minute check of every screen against realistic data. The unit tests cover the logic; this finds what they can't
(layout, real-data quirks, roles, slow queries). Write down anything that looks off with the step number.

## 1. Set up (development database only)

```powershell
cd C:\Users\jsswp\POWER\poehr_scheduling
python manage.py migrate                       # applies surgery 0001-0006
python manage.py shell -c "from users.models import Organization as O; print(list(O.objects.values_list('id','name')))"
python manage.py seed_surgery_demo --org <id or exact name>
```

Needs the org to have an active facility, at least one patient (it never creates patients), and ideally a doctor and
a nurse. `--reset` removes only the cases tagged `[DEMO]` and reseeds; `--date 2026-11-04` books another day. The
command refuses to run when `DEBUG` is off unless you pass `--force`, so it cannot be run against production by
accident. Do not seed a database that holds real patients you do not want demo cases attached to.

Start the API and the front end as you normally do, then sign in as a **nurse** (most steps) and later as an
**admin** (steps 11 to 13) and a **patient/staff** user (step 14).

## 2. What the seed creates (for 9 cases on the chosen day, rooms OR-1, OR-2, OR-3)

| Time | Room | Status | Notes |
|---|---|---|---|
| 07:30 | OR-1 | Discharged | AV fistula, 156 min in room, full detail |
| 08:00 | OR-2 | Discharged | Cystoscopy, 52 min |
| 09:30 | OR-2 | In PACU | |
| 10:00 | OR-1 | In OR | |
| 11:30 | OR-3 | In PreOp | |
| 13:00 | OR-1 | Pending | |
| 13:30 | OR-1 | Pending (urgent) | **overlaps 13:00 on purpose** |
| 14:00 | OR-2 | Procedure Cancelled | reason "Patient not NPO" |
| 15:00 | OR-3 | Transferred to Inpatient | emergent |

## 3. Checklist

**Case List and Day Planner**
1. Case List shows 9 rows, each with a coloured left edge. The legend counts: Discharged 2, Cancelled 1, Transferred 1,
   Pending 2, In PreOp 1, In OR 1, In PACU 1.
2. Search by a patient's last name, by a case number, by "cysto". Filter Status and Room.
3. Day Planner: three room rows, bars in the status colours, the two 13:00/13:30 OR-1 bars flagged as overlapping.
   Resize the window: the planner must scroll rather than squash.
4. Status Board tab: names masked as last name plus initial; try the text sizes, Full screen, Hide finished cases.

**Booking and status**
5. New Case: patient search, pick a visit, add two procedures, save. A warning toast appears if it overlaps another case.
   Modify Case changes it; a closed case only lets the comments change.
6. Select the Pending 13:00 case, Start PreOp, then Patient In OR, then Move to PACU, then Close Case, Discharged.
   Times stamp as you go. Try Cancel Case without a reason: it must refuse.

**Case Details (open the 07:30 discharged case)**
7. **Case Header:** scheduled 07:30, delayed 0:12 with reason "Previous Case Ran Over", actual 07:42 to 10:18,
   duration 2:36, physical status ASA 2. Last status modification shows a person and time. Notes save.
8. **Intra-op:** the planned procedure; participants (surgeon, anesthesiologist, circulator, PACU RN, vendor) with times;
   Add Participant, Add Me, a typed vendor name; change a time out earlier than time in: it must refuse. The Times
   grid shows Patient In with its reason; edit and Save Times.
9. **Case Usage:** one Primary preference card; supplies grouped by category (Equipment, Unsterile, Instrument,
   Medications, Prep). Change Hold to 1 on CHUCKS: Used drops from 2 to 1. Add a card and a supply item.
   **Pre-op / Post-op** show the card's notes ("CLIP, SURGICLIP M-11.5" on post-op).
10. **Charges:** expect 4 usage lines already **Posted** and time lines **Pending Post**: OR time 1 first block
    (UOORL130, $850.00) plus 9 extra blocks (UOORL115, $1,890.00 total), and anesthesia 1 plus 9 (ANSG0001 $420.00,
    ANSG0002 $855.00 total). Click Generate Charges: pending lines are rebuilt, posted lines stay. Post Selected
    turns the rest to Posted and the header status to **Posted**. A posted line cannot be edited or removed.
    **Documents:** upload a PDF (Consent), download it, remove it; try a .txt file and a 12 MB file: both refuse.
    **Modification History** lists every change above, grouped by person and time. **Link Visit** lists the
    patient's visits with date and status filters.

**Admin and access**
11. As admin: **Manage Rooms** (add OR-4, it appears at the bottom of the planner) and **Setup**:
    Preference Cards (open one, edit a supply, save), Charge Policies, Price List (add a code, then change its price
    by adding it again). A nurse must not see either button.
12. After changing a price, Generate Charges on a case that has pending lines: amounts follow the new price.
13. In Setup, create a card with two supplies, then merge it onto a Pending case (Case Usage tab).
14. A patient or staff-role user opening `/surgery` must be sent away to `/solutions`.

**Cross-checks worth doing once**
15. Two browsers: change a status in one, the other's list updates within 30 seconds (the page refreshes itself).
16. If the organization has several facilities, the facility picker switches rooms and cases; a user assigned to one
    facility must not see the others.
17. Open the browser's network tab on the Case List: one `planner` and one `cases` call per refresh, each well under a
    second. Report anything slower with the number of cases it had.

## 4. Known gaps (not bugs)

* A system admin with no organization gets "No facility available" (no organization switcher yet).
* The seed uses your existing patients: with fewer than 9, patients repeat across cases.
* No inline document preview (download only), and documents live on the Render persistent disk.
* Preference-card edits do not change cases that already used the card (each case keeps its own copy).
* MLM charge policies use the same block maths as case-time policies.
* Nothing here has been run on Postgres or through the project's own `react-scripts` build yet; this walkthrough is
  that first real run. Please also run `npm test` and `npm run build` in `frontend`.

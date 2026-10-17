"""
What each Master Schedule day code means on the Calendar tab.

"Create schedule" turns every code below into real calendar shifts (StaffShift
rows). "R" (requested off) and "x" are days off and create nothing. A code with
two parts ("3 11") is a double: both shifts are created on that date.
"""

import datetime

T = datetime.time

# code -> [(shift_type, start, end), ...]
CODE_SHIFTS = {
    "7": [("day", T(7, 0), T(15, 0))],
    "7A": [("day", T(7, 0), T(19, 0))],
    "7P": [("night", T(19, 0), T(7, 0))],
    "7p": [("night", T(19, 0), T(7, 0))],
    "3": [("evening", T(15, 0), T(23, 0))],
    "11": [("night", T(23, 0), T(7, 0))],
    "3 11": [("evening", T(15, 0), T(23, 0)), ("night", T(23, 0), T(7, 0))],
}

# Marks calendar shifts made by Create schedule, so a re-run can tell them apart
# from shifts someone entered by hand or that came from a recurring pattern.
MASTER_NOTE = "From Master Schedule"

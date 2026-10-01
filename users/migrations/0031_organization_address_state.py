import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0030_patient_identity_and_registration"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="address_line1",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="organization",
            name="address_line2",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="organization",
            name="city",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="organization",
            name="state",
            field=models.CharField(
                blank=True,
                choices=[
                    ("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"),
                    ("CA", "California"), ("CO", "Colorado"), ("CT", "Connecticut"), ("DE", "Delaware"),
                    ("DC", "District of Columbia"), ("FL", "Florida"), ("GA", "Georgia"), ("HI", "Hawaii"),
                    ("ID", "Idaho"), ("IL", "Illinois"), ("IN", "Indiana"), ("IA", "Iowa"),
                    ("KS", "Kansas"), ("KY", "Kentucky"), ("LA", "Louisiana"), ("ME", "Maine"),
                    ("MD", "Maryland"), ("MA", "Massachusetts"), ("MI", "Michigan"), ("MN", "Minnesota"),
                    ("MS", "Mississippi"), ("MO", "Missouri"), ("MT", "Montana"), ("NE", "Nebraska"),
                    ("NV", "Nevada"), ("NH", "New Hampshire"), ("NJ", "New Jersey"), ("NM", "New Mexico"),
                    ("NY", "New York"), ("NC", "North Carolina"), ("ND", "North Dakota"), ("OH", "Ohio"),
                    ("OK", "Oklahoma"), ("OR", "Oregon"), ("PA", "Pennsylvania"), ("PR", "Puerto Rico"),
                    ("RI", "Rhode Island"), ("SC", "South Carolina"), ("SD", "South Dakota"),
                    ("TN", "Tennessee"), ("TX", "Texas"), ("UT", "Utah"), ("VT", "Vermont"),
                    ("VA", "Virginia"), ("WA", "Washington"), ("WV", "West Virginia"),
                    ("WI", "Wisconsin"), ("WY", "Wyoming"),
                ],
                default="",
                help_text="Two-letter state of the clinic; selects the state staffing rules.",
                max_length=2,
            ),
        ),
        migrations.AddField(
            model_name="organization",
            name="postal_code",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
        migrations.AddField(
            model_name="organization",
            name="staffing_spare_buffer",
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text="Calendar 'at risk' buffer: a covered shift turns amber when losing this many staff would break coverage. 0 = amber only for pending off requests or open call-outs.",
                validators=[django.core.validators.MaxValueValidator(2)],
            ),
        ),
    ]

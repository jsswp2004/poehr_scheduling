from django.contrib import admin

from .models import PharmacyPrice


@admin.register(PharmacyPrice)
class PharmacyPriceAdmin(admin.ModelAdmin):
    """
    The clinic's price table (PHP per unit) is also editable here.

    VAT-exempt items: a pharmacist must tick "vat_exempt" for the medicines in the clinic's formulary that are
    already exempt from VAT under the Tax Code (e.g. certain medicines for diabetes, hypertension and high
    cholesterol). Senior citizen / PWD sales are VAT-exempt regardless.
    """

    list_display = ("drug_name", "unit", "unit_price", "vat_exempt", "is_active", "organization")
    list_filter = ("organization", "vat_exempt", "is_active")
    search_fields = ("drug_name",)

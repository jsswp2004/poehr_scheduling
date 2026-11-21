from django.contrib import admin

from .models import PharmacyPrice


@admin.register(PharmacyPrice)
class PharmacyPriceAdmin(admin.ModelAdmin):
    """The clinic's price table (PHP per unit) is also editable here."""

    list_display = ("drug_name", "unit", "unit_price", "vat_exempt", "is_active", "organization")
    list_filter = ("organization", "vat_exempt", "is_active")
    search_fields = ("drug_name",)

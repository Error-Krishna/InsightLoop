from django import forms
from .models import BusinessData

class ManualDataForm(forms.Form):
    date = forms.DateField()
    product = forms.CharField(max_length=100)
    category = forms.CharField(max_length=50, required=False)
    sales = forms.IntegerField(min_value=0)
    revenue = forms.FloatField(min_value=0)  # ADD THIS FIELD
    profit = forms.FloatField()
    region = forms.CharField(max_length=50)
    customer_type = forms.ChoiceField(choices=BusinessData.customer_type.choices)
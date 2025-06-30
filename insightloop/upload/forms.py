from django import forms
from .models import BusinessData

class ManualDataForm(forms.Form):
    date = forms.DateField()
    product = forms.CharField(max_length=100)
    category = forms.CharField(max_length=50, required=False)
    quantity = forms.IntegerField(min_value=1)
    production_cost = forms.FloatField(min_value=0, label="Production Cost per Unit")
    selling_price = forms.FloatField(min_value=0, label="Selling Price per Unit")
    region = forms.CharField(max_length=50)
    customer_type = forms.ChoiceField(choices=BusinessData.customer_type.choices)
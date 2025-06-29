from django import forms
from .models import BusinessData

class ManualDataForm(forms.Form):
    date = forms.DateField(
        widget=forms.DateInput(attrs={'type': 'date', 'class': 'form-input'}),
        required=True
    )
    product = forms.CharField(
        widget=forms.TextInput(attrs={'class': 'form-input'}),
        max_length=100,
        required=True
    )
    category = forms.CharField(
        widget=forms.TextInput(attrs={'class': 'form-input'}),
        max_length=50, 
        required=False
    )
    sales = forms.IntegerField(
        widget=forms.NumberInput(attrs={'class': 'form-input'}),
        min_value=0,
        required=True
    )
    profit = forms.FloatField(
        widget=forms.NumberInput(attrs={'class': 'form-input', 'step': '0.01'}),
        required=True
    )
    region = forms.CharField(
        widget=forms.TextInput(attrs={'class': 'form-input'}),
        max_length=50,
        required=True
    )
    customer_type = forms.ChoiceField(
        widget=forms.Select(attrs={'class': 'form-select'}),
        choices=[('Retail', 'Retail'), ('Wholesale', 'Wholesale'), ('Online', 'Online')],
        required=True
    )
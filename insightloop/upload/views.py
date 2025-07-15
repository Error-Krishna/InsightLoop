from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.conf import settings
from .models import BusinessData
from .forms import ManualDataForm
import csv
from io import TextIOWrapper
from datetime import datetime
from dashboard.management.commands.process_uploaded_data import generate_financial_summaries  # Import directly
from insightloop.auth_utils import is_authenticated

def upload(request):
    if not is_authenticated(request):
        return redirect(f'{settings.LOGIN_URL}?next={request.path}')
    
    # Convert company_id to string for consistency
    company_id = str(request.company_id)
    
    if request.method == 'POST':
        form_type = request.POST.get('form_type')
        records_created = 0  # Track if any records were created
        
        if form_type == 'csv' and 'csv_file' in request.FILES:
            csv_file = request.FILES['csv_file']
            if not csv_file.name.endswith('.csv'):
                messages.error(request, 'Please upload a valid CSV file')
                return redirect('upload')
            
            try:
                io_string = TextIOWrapper(csv_file.file, encoding='utf-8-sig')
                reader = csv.DictReader(io_string)
                
                required_columns = {'date', 'product', 'quantity', 'production_cost', 
                                  'selling_price', 'region', 'customer_type'}
                if not required_columns.issubset(set(reader.fieldnames)):
                    missing = required_columns - set(reader.fieldnames)
                    messages.error(request, f'Missing required columns: {", ".join(missing)}')
                    return redirect('upload')
                
                for row_num, row in enumerate(reader, 1):
                    try:
                        BusinessData(
                            company_id=company_id,
                            date=datetime.strptime(row['date'], '%Y-%m-%d').date(),
                            product=row['product'],
                            category=row.get('category', ''),
                            quantity=int(row['quantity']),
                            production_cost=float(row['production_cost']),
                            selling_price=float(row['selling_price']),
                            region=row['region'],
                            customer_type=row['customer_type']
                        ).save()  # Explicit save
                        records_created += 1
                    except Exception as e:
                        messages.warning(request, f'Row {row_num}: {str(e)}')
                
                if records_created > 0:
                    messages.success(request, f'Successfully imported {records_created} records!')
                else:
                    messages.info(request, 'No records were imported from CSV')
            except Exception as e:
                messages.error(request, f'Error processing CSV: {str(e)}')
        
        elif form_type == 'manual':
            form = ManualDataForm(request.POST)
            if form.is_valid():
                try:
                    # Create and save document immediately
                    BusinessData(
                        company_id=company_id,
                        date=form.cleaned_data['date'],
                        product=form.cleaned_data['product'],
                        category=form.cleaned_data['category'],
                        quantity=form.cleaned_data['quantity'],
                        production_cost=form.cleaned_data['production_cost'],
                        selling_price=form.cleaned_data['selling_price'],
                        region=form.cleaned_data['region'],
                        customer_type=form.cleaned_data['customer_type']
                    ).save()  # Explicit save
                    records_created = 1
                    messages.success(request, 'Data added successfully!')
                except Exception as e:
                    messages.error(request, f'Error saving data: {str(e)}')
            else:
                for field, errors in form.errors.items():
                    for error in errors:
                        messages.error(request, f"{field.capitalize()}: {error}")
        
        # Only process data if new records were added
        if records_created > 0:
            try:
                # Direct function call instead of management command
                generate_financial_summaries(company_id)
                messages.success(request, 'Data processed successfully! Dashboard updated.')
            except Exception as e:
                messages.error(request, f'Error processing data: {str(e)}')
        else:
            messages.info(request, "No new records added. Processing skipped.")
    
    return render(request, 'upload/DataUpload.html')
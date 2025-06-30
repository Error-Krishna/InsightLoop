
from django.core.management import call_command
from django.shortcuts import render, redirect
from django.contrib import messages
from .models import BusinessData
from .forms import ManualDataForm
import csv
from io import TextIOWrapper
from datetime import datetime

def upload(request):
    if request.method == 'POST':
        form_type = request.POST.get('form_type')
        
        # CSV Upload Handling
        if form_type == 'csv' and 'csv_file' in request.FILES:
            csv_file = request.FILES['csv_file']
            if not csv_file.name.endswith('.csv'):
                messages.error(request, 'Please upload a valid CSV file')
                return redirect('upload')
            
            try:
                # Process CSV
                io_string = TextIOWrapper(csv_file.file, encoding='utf-8-sig')  # Handle BOM
                reader = csv.DictReader(io_string)
                
                # Validate columns
                required_columns = {'date', 'product', 'sales', 'revenue', 'profit', 'region', 'customer_type'}
                if not required_columns.issubset(set(reader.fieldnames)):
                    missing = required_columns - set(reader.fieldnames)
                    messages.error(request, f'Missing required columns: {", ".join(missing)}')
                    return redirect('upload')
                
                records_created = 0
                for row_num, row in enumerate(reader, 1):
                    try:
                        # Validate and create record
                        BusinessData.objects.create(
                            date=datetime.strptime(row['date'], '%Y-%m-%d').date(),
                            product=row['product'],
                            category=row.get('category', ''),
                            sales=int(row['sales']),
                            revenue=float(row['revenue']),  # ADD THIS LINE
                            profit=float(row['profit']),
                            region=row['region'],
                            customer_type=row['customer_type']
                        )
                        records_created += 1
                    except Exception as e:
                        messages.warning(request, f'Row {row_num}: {str(e)}')
                
                messages.success(request, f'Successfully imported {records_created} records!')
            except Exception as e:
                messages.error(request, f'Error processing CSV: {str(e)}')
        
        # Manual Form Handling
        elif form_type == 'manual':
            form = ManualDataForm(request.POST)
            if form.is_valid():
                try:
                    BusinessData.objects.create(
                        date=form.cleaned_data['date'],
                        product=form.cleaned_data['product'],
                        category=form.cleaned_data['category'],
                        sales=form.cleaned_data['sales'],
                        revenue=form.cleaned_data['revenue'],  # ADD THIS LINE
                        profit=form.cleaned_data['profit'],
                        region=form.cleaned_data['region'],
                        customer_type=form.cleaned_data['customer_type']
                    )
                    messages.success(request, 'Data added successfully!')
                except Exception as e:
                    messages.error(request, f'Error saving data: {str(e)}')
            else:
                for field, errors in form.errors.items():
                    for error in errors:
                        messages.error(request, f"{field.capitalize()}: {error}")
        
        # AFTER SUCCESSFUL UPLOAD:
        try:
            # Process uploaded data
            call_command('process_uploaded_data')
            messages.success(request, 'Data processed successfully! Dashboard updated.')
        except Exception as e:
            messages.error(request, f'Error processing data: {str(e)}')
        
        return redirect('upload')
    
    return render(request, 'upload/DataUpload.html')
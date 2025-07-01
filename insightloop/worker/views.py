# views.py - Update with complete implementation
from django.shortcuts import render, redirect
from django.http import JsonResponse
from .models import Worker, MaterialAssignment, PayRecord
from datetime import datetime
from mongoengine.queryset.visitor import Q
import json
from bson import ObjectId

def pay_distribution(request):
    """Render the main payment management page"""
    return render(request, 'workers/Worker.html')

def get_workers(request):
    """Get all workers with their material and payment stats"""
    try:
        workers = Worker.objects.all()
        workers_data = []
        
        for worker in workers:
            # Get material stats
            assignments = MaterialAssignment.objects.filter(worker=worker)
            total_assigned = sum([a.quantity for a in assignments])
            total_delivered = sum([sum([b.get('quantity', 0) for b in a.batches]) for a in assignments])
            
            # Get pending payments (records that are not fully paid)
            payment_records = PayRecord.objects.filter(worker=worker)
            pending_amount = 0
            for record in payment_records:
                total_amount = record.units_produced * record.rate_per_unit
                if not (record.paid or record.amount_paid >= total_amount):
                    pending_amount += (total_amount - (record.amount_paid or 0))
            
            workers_data.append({
                'id': str(worker.id),
                'name': worker.name,
                'material_assigned': total_assigned,
                'material_delivered': total_delivered,
                'pending_amount': pending_amount
            })
        
        return JsonResponse({
            'success': True,
            'workers': workers_data
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=400)

def get_payment_records(request):
    """Get payment records with filtering option"""
    try:
        filter_type = request.GET.get('filter', 'all')
        
        records = PayRecord.objects.all().order_by('-date')
        
        filtered_records = []
        for record in records:
            total_amount = record.units_produced * record.rate_per_unit
            is_pending = record.amount_paid == 0 and not record.paid
            is_partial = 0 < record.amount_paid < total_amount
            is_paid = record.paid or (record.amount_paid >= total_amount)
            
            # Apply filters
            if filter_type == 'all' or \
               (filter_type == 'pending' and is_pending) or \
               (filter_type == 'partial' and is_partial) or \
               (filter_type == 'paid' and is_paid):
                
                filtered_records.append({
                    'id': str(record.id),
                    'worker_name': record.worker.name,
                    'product_name': record.product_name,
                    'units_produced': record.units_produced,
                    'rate_per_unit': record.rate_per_unit,
                    'amount_paid': record.amount_paid,
                    'date': record.date.strftime('%Y-%m-%d'),
                    'paid': is_paid
                })
        
        return JsonResponse({
            'success': True,
            'records': filtered_records
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=400)
    

def create_payment_record(request):
    """Create a new payment record"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            worker = Worker.objects.get(id=ObjectId(data.get('worker_id')))
            
            amount_paid = float(data.get('amount_paid', 0))
            total_amount = float(data.get('units_produced')) * float(data.get('rate_per_unit'))
            
            pay_record = PayRecord(
                worker=worker,
                product_name=data.get('product_name'),
                units_produced=int(data.get('units_produced')),
                rate_per_unit=float(data.get('rate_per_unit')),
                amount_paid=amount_paid,
                paid=amount_paid >= total_amount,
                date=datetime.strptime(data.get('date'), '%Y-%m-%d')
            )
            pay_record.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Pay record saved successfully'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=400)

def mark_paid(request, record_id):
    """Mark a payment record as paid"""
    if request.method == 'POST':
        try:
            record = PayRecord.objects.get(id=ObjectId(record_id))
            total_amount = record.units_produced * record.rate_per_unit
            record.amount_paid = total_amount
            record.paid = True
            record.updated_at = datetime.now()
            record.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Payment marked as paid'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=400)

def delete_payment_record(request, record_id):
    """Delete a payment record"""
    if request.method == 'DELETE':
        try:
            record = PayRecord.objects.get(id=ObjectId(record_id))
            record.delete()
            
            return JsonResponse({
                'success': True,
                'message': 'Record deleted successfully'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=400)

def add_worker(request):
    """Add a new worker"""
    if request.method == 'POST':
        try:
            data = request.POST
            worker = Worker(
                name=data.get('name'),
                age=int(data.get('age')),
                address=data.get('address'),
                phone=data.get('phone'),
                joining_date=datetime.strptime(data.get('joining_date'), '%Y-%m-%d')
            )
            
            if 'image' in request.FILES:
                # In production, upload to cloud storage and save URL
                worker.image_url = f"/media/workers/{request.FILES['image'].name}"
                # You'll need to configure Django to handle file uploads
            
            worker.save()
            return JsonResponse({
                'success': True, 
                'message': 'Worker added successfully',
                'worker_id': str(worker.id)
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=400)

def get_worker_stats(request, worker_id):
    """Get stats for a specific worker"""
    try:
        worker = Worker.objects.get(id=ObjectId(worker_id))
        
        # Calculate material stats
        assignments = MaterialAssignment.objects.filter(worker=worker)
        total_assigned = sum([a.quantity for a in assignments])
        total_delivered = sum([sum([b.get('quantity', 0) for b in a.batches]) for a in assignments])
        
        # Calculate pending payments
        pending_payments = PayRecord.objects.filter(worker=worker, paid=False)
        pending_amount = sum([p.units_produced * p.rate_per_unit for p in pending_payments])
        
        return JsonResponse({
            'success': True,
            'assigned': total_assigned,
            'delivered': total_delivered,
            'balance': total_assigned - total_delivered,
            'pending_amount': pending_amount
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=400)
    

def material_distribution(request):
    if request.method == 'POST':
        try:
            data = request.POST
            worker = Worker.objects.get(id=data.get('worker_id'))
            
            assignment = MaterialAssignment(
                worker=worker,
                material_name=data.get('material_name'),
                quantity=int(data.get('quantity')),
                price_per_unit=float(data.get('price_per_unit')),
                assignment_date=datetime.strptime(data.get('assignment_date'), '%Y-%m-%d'),
                notes=data.get('notes', '')
            )
            
            # Process batches if any
            batches = json.loads(request.POST.get('batches', '[]'))
            assignment.batches = batches
            assignment.save()
            
            return JsonResponse({'success': True, 'message': 'Material assigned successfully'})
        except Exception as e:
            return JsonResponse({'success': False, 'message': str(e)}, status=400)
    
    workers = Worker.objects.all()
    assignments = MaterialAssignment.objects.all()
    return render(request, 'workers/MaterialDistribution.html', {
        'workers': workers,
        'assignments': assignments
    })

def update_paid_amount(request, record_id):
    """Update the paid amount for a payment record"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            record = PayRecord.objects.get(id=ObjectId(record_id))
            total_amount = record.units_produced * record.rate_per_unit
            amount_paid = float(data.get('amount_paid', 0))
            
            record.amount_paid = amount_paid
            record.paid = (amount_paid >= total_amount)
            record.updated_at = datetime.now()
            record.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Paid amount updated successfully'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=400)
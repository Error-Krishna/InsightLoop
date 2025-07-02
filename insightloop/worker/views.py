from django.shortcuts import render, redirect
from django.http import JsonResponse
from .models import Worker, MaterialAssignment, PayRecord
from datetime import datetime
from bson import ObjectId, errors
import json
import logging

logger = logging.getLogger(__name__)

def pay_distribution(request):
    return render(request, 'workers/Worker.html')

def get_workers(request):
    try:
        workers = Worker.objects.all()
        workers_data = []
        
        for worker in workers:
            assignments = MaterialAssignment.objects.filter(worker=worker)
            total_assigned = sum([a.quantity for a in assignments])
            total_delivered = sum([a.delivered_quantity for a in assignments])
            
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
        logger.error(f"Error in get_workers: {str(e)}")
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=400)

def get_payment_records(request):
    try:
        filter_type = request.GET.get('filter', 'all')
        
        records = PayRecord.objects.all().order_by('-date')
        
        filtered_records = []
        for record in records:
            total_amount = record.units_produced * record.rate_per_unit
            is_pending = record.amount_paid == 0 and not record.paid
            is_partial = 0 < record.amount_paid < total_amount
            is_paid = record.paid or (record.amount_paid >= total_amount)
            
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
        logger.error(f"Error in get_payment_records: {str(e)}")
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=400)

def create_payment_record(request):
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
            logger.error(f"Error in create_payment_record: {str(e)}")
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=405)

def mark_paid(request, record_id):
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
            logger.error(f"Error in mark_paid: {str(e)}")
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=405)

def delete_payment_record(request, record_id):
    if request.method == 'DELETE':
        try:
            record = PayRecord.objects.get(id=ObjectId(record_id))
            record.delete()
            
            return JsonResponse({
                'success': True,
                'message': 'Record deleted successfully'
            })
        except Exception as e:
            logger.error(f"Error in delete_payment_record: {str(e)}")
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=405)

def add_worker(request):
    if request.method == 'POST':
        try:
            data = request.POST
            worker = Worker(
                name=data.get('name'),
                age=int(data.get('age')) if data.get('age') else None,
                address=data.get('address'),
                phone=data.get('phone'),
                joining_date=datetime.strptime(data.get('joining_date'), '%Y-%m-%d') if data.get('joining_date') else datetime.now()
            )
            
            if 'image' in request.FILES:
                worker.image_url = f"/media/workers/{request.FILES['image'].name}"
            
            worker.save()
            return JsonResponse({
                'success': True, 
                'message': 'Worker added successfully',
                'worker_id': str(worker.id)
            })
        except Exception as e:
            logger.error(f"Error in add_worker: {str(e)}")
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=405)

def get_worker_stats(request, worker_id):
    try:
        logger.info(f"Getting stats for worker ID: {worker_id}")
        
        # Validate worker ID format
        if not ObjectId.is_valid(worker_id):
            logger.warning(f"Invalid worker ID format: {worker_id}")
            return JsonResponse({'success': False, 'message': 'Invalid worker ID format'}, status=400)
        
        # Convert to ObjectId and fetch worker
        worker_obj_id = ObjectId(worker_id)
        worker = Worker.objects.get(id=worker_obj_id)
        
        # Calculate material stats
        assignments = MaterialAssignment.objects.filter(worker=worker)
        total_assigned = sum([a.quantity for a in assignments])
        total_delivered = sum([a.delivered_quantity for a in assignments])
        
        logger.info(f"Stats for {worker.name}: assigned={total_assigned}, delivered={total_delivered}")
        
        return JsonResponse({
            'success': True,
            'assigned': total_assigned,
            'delivered': total_delivered,
            'balance': total_assigned - total_delivered
        })
    except Worker.DoesNotExist:
        logger.error(f"Worker not found: {worker_id}")
        return JsonResponse({'success': False, 'message': 'Worker not found'}, status=404)
    except Exception as e:
        logger.exception(f"Error in get_worker_stats: {str(e)}")
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=400)

def material_distribution(request):
    if request.method == 'POST':
        try:
            data = request.POST
            worker_id = data.get('worker_id')
            
            if not worker_id:
                return JsonResponse({'success': False, 'message': 'Worker is required'}, status=400)
                
            # Validate and convert worker ID
            if not ObjectId.is_valid(worker_id):
                return JsonResponse({'success': False, 'message': 'Invalid worker ID format'}, status=400)
                
            worker = Worker.objects.get(id=ObjectId(worker_id))
            
            batches_data = data.get('batches', '[]')
            try:
                batches = json.loads(batches_data) if batches_data else []
            except json.JSONDecodeError as e:
                return JsonResponse({'success': False, 'message': f'Invalid batches data: {str(e)}'}, status=400)
            
            # Create the assignment
            assignment = MaterialAssignment(
                worker=worker,
                material_name=data.get('material_name'),
                quantity=int(data.get('quantity')),
                price_per_unit=float(data.get('price_per_unit')),
                assignment_date=datetime.strptime(data.get('assignment_date'), '%Y-%m-%d'),
                notes=data.get('notes', ''),
                batches=batches
            )
            assignment.save()
            
            return JsonResponse({'success': True, 'message': 'Material assigned successfully'})
        except Worker.DoesNotExist:
            return JsonResponse({'success': False, 'message': 'Worker not found'}, status=404)
        except Exception as e:
            logger.exception(f"Error in material_distribution (POST): {str(e)}")
            return JsonResponse({'success': False, 'message': str(e)}, status=500)
    
     # GET request: fetch workers and assignments
    workers = list(Worker.objects.all().only('id', 'name', 'image_url'))
    # Convert worker IDs to strings
    for worker in workers:
        worker.id = str(worker.id)

    assignments = MaterialAssignment.objects.all().order_by('-assignment_date')

    # Pre-fetch workers to avoid N+1 queries
    worker_map = {}
    worker_ids = []
    
    for assignment in assignments:
        # Use assignment.worker.id directly (it's already an ObjectId)
        worker_id_str = str(assignment.worker.id)
        worker_ids.append(worker_id_str)
    
    if worker_ids:
        # Convert string IDs back to ObjectId for querying
        object_ids = [ObjectId(wid) for wid in set(worker_ids) if ObjectId.is_valid(wid)]
        
        if object_ids:
            workers_list = Worker.objects.filter(id__in=object_ids).only('id', 'name')
            # Create a map of worker ID strings to worker objects
            for worker in workers_list:
                worker.id_str = str(worker.id)  # Add string version of ID
                worker_map[worker.id_str] = worker
    
    # Attach workers to assignments
    for assignment in assignments:
        worker_id_str = str(assignment.worker.id)
        assignment.cached_worker = worker_map.get(worker_id_str)

    return render(request, 'workers/MaterialDistribution.html', {
        'workers': workers,
        'assignments': assignments
    })

def add_batch_to_assignment(request, assignment_id):
    if request.method == 'POST':
        try:
            # Validate assignment_id
            if not ObjectId.is_valid(assignment_id):
                return JsonResponse({'success': False, 'message': 'Invalid assignment ID'}, status=400)
                
            data = json.loads(request.body)
            assignment = MaterialAssignment.objects.get(id=ObjectId(assignment_id))
            
            # Validate batch quantity
            balance = assignment.balance_quantity
            new_quantity = int(data.get('quantity'))
            
            if new_quantity <= 0:
                return JsonResponse({
                    'success': False,
                    'message': 'Quantity must be positive'
                }, status=400)
                
            if new_quantity > balance:
                return JsonResponse({
                    'success': False,
                    'message': f'Cannot add batch: quantity exceeds balance ({balance} units available)'
                }, status=400)
            
            # Validate batch date
            batch_date = datetime.strptime(data.get('date'), '%Y-%m-%d').date()
            if batch_date > datetime.now().date():
                return JsonResponse({
                    'success': False,
                    'message': 'Batch date cannot be in the future'
                }, status=400)
            
            new_batch = {
                'quantity': new_quantity,
                'date': data.get('date'),
                'created_at': datetime.now().isoformat()
            }
            
            assignment.batches.append(new_batch)
            assignment.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Batch added successfully'
            })
        except MaterialAssignment.DoesNotExist:
            return JsonResponse({'success': False, 'message': 'Assignment not found'}, status=404)
        except ValueError as e:
            return JsonResponse({'success': False, 'message': 'Invalid date format'}, status=400)
        except Exception as e:
            logger.error(f"Error in add_batch_to_assignment: {str(e)}")
            return JsonResponse({'success': False, 'message': str(e)}, status=500)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=405)

def delete_assignment(request, assignment_id):
    if request.method == 'DELETE':
        try:
            if not ObjectId.is_valid(assignment_id):
                return JsonResponse({'success': False, 'message': 'Invalid assignment ID'}, status=400)
                
            assignment = MaterialAssignment.objects.get(id=ObjectId(assignment_id))
            assignment.delete()
            return JsonResponse({
                'success': True,
                'message': 'Assignment deleted successfully'
            })
        except MaterialAssignment.DoesNotExist:
            return JsonResponse({'success': False, 'message': 'Assignment not found'}, status=404)
        except Exception as e:
            logger.error(f"Error in delete_assignment: {str(e)}")
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=405)

def update_paid_amount(request, record_id):
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
            logger.error(f"Error in update_paid_amount: {str(e)}")
            return JsonResponse({
                'success': False,
                'message': str(e)
            }, status=400)
    return JsonResponse({
        'success': False,
        'message': 'Invalid request method'
    }, status=405)


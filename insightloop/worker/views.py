from django.shortcuts import render, redirect
from django.http import JsonResponse
import mongoengine

from django.conf import settings  # Correct import for settings

from .models import Worker, MaterialAssignment, PayRecord
from datetime import datetime
from bson import ObjectId, errors
import json
import logging
from mongoengine.errors import DoesNotExist
from django.db.models import Sum, F
from bson.dbref import DBRef
from django.contrib.auth.decorators import login_required
from insightloop.auth_utils import is_authenticated

logger = logging.getLogger(__name__)


def pay_distribution(request):
    if not is_authenticated(request):
        return redirect(f'{settings.LOGIN_URL}?next={request.path}')
    else:
        return render(request, 'workers/Worker.html')


def get_workers(request):
    try:
        if not hasattr(request, 'company_id') or not request.company_id:
            return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
        
        workers = Worker.objects.filter(company_id=request.company_id)
        workers_data = []
        
        for worker in workers:
            assignments = MaterialAssignment.objects.filter(worker=worker, company_id=request.company_id)
            total_assigned = sum([a.quantity for a in assignments])
            total_delivered = sum([a.delivered_quantity for a in assignments])
            
            payment_records = PayRecord.objects.filter(worker=worker, company_id=request.company_id)
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
        if not hasattr(request, 'company_id') or not request.company_id:
            return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
            
        filter_type = request.GET.get('filter', 'all')
        
        records = PayRecord.objects.filter(company_id=request.company_id).order_by('-date')
        
        filtered_records = []
        for record in records:
            total_amount = record.units_produced * record.rate_per_unit
            is_pending = record.amount_paid == 0 and not record.paid
            is_partial = 0 < record.amount_paid < total_amount
            is_paid = record.paid or (record.amount_paid >= total_amount)
            
            try:
                worker_name = record.worker.name
            except DoesNotExist:
                worker_name = "Worker Deleted"
            
            if filter_type == 'all' or \
               (filter_type == 'pending' and is_pending) or \
               (filter_type == 'partial' and is_partial) or \
               (filter_type == 'paid' and is_paid):
                
                filtered_records.append({
                    'id': str(record.id),
                    'worker_name': worker_name,
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
            if not hasattr(request, 'company_id') or not request.company_id:
                return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
                
            data = json.loads(request.body)
            worker = Worker.objects.get(
                id=ObjectId(data.get('worker_id')),
                company_id=request.company_id
            )
            
            amount_paid = float(data.get('amount_paid', 0))
            total_amount = float(data.get('units_produced')) * float(data.get('rate_per_unit'))
            
            pay_record = PayRecord(
                company_id=request.company_id,
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
            if not hasattr(request, 'company_id') or not request.company_id:
                return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
                
            record = PayRecord.objects.get(
                id=ObjectId(record_id),
                company_id=request.company_id
            )
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
            if not hasattr(request, 'company_id') or not request.company_id:
                return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
                
            record = PayRecord.objects.get(
                id=ObjectId(record_id),
                company_id=request.company_id
            )
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
            if not hasattr(request, 'company_id') or not request.company_id:
                return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
                
            data = request.POST
            worker = Worker(
                company_id=request.company_id,
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
        if not hasattr(request, 'company_id') or not request.company_id:
            return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
            
        logger.info(f"Getting stats for worker ID: {worker_id}")
        
        if not worker_id or not ObjectId.is_valid(worker_id):
            logger.warning(f"Invalid worker ID format: {worker_id or 'None'}")
            return JsonResponse({
                'success': False, 
                'message': f'Invalid worker ID format: {worker_id or "None"}'
            }, status=400)
        
        worker_obj_id = ObjectId(worker_id)
        logger.debug(f"Querying for worker with ID: {worker_obj_id}")
        
        try:
            worker = Worker.objects.get(
                id=worker_obj_id,
                company_id=request.company_id
            )
        except Worker.DoesNotExist:
            logger.warning(f"Worker not found by ObjectId, trying string match: {worker_id}")
            worker = Worker.objects.get(
                id=worker_id,
                company_id=request.company_id
            )
        
        assignments = MaterialAssignment.objects.filter(
            worker=worker,
            company_id=request.company_id
        )
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
        logger.error(f"Worker not found: string_id={worker_id}")
        return JsonResponse({
            'success': False,
            'message': f'Worker not found with ID: {worker_id}'
        }, status=404)
    except Exception as e:
        logger.exception(f"Error in get_worker_stats: {str(e)}")
        return JsonResponse({
            'success': False,
            'message': str(e)
        }, status=400)


def material_distribution(request):
    if request.method == 'POST':
        try:
            if not hasattr(request, 'company_id') or not request.company_id:
                return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
                
            data = request.POST
            worker_id = data.get('worker_id')
            
            if not worker_id:
                return JsonResponse({'success': False, 'message': 'Worker is required'}, status=400)
                
            if not ObjectId.is_valid(worker_id):
                return JsonResponse({'success': False, 'message': 'Invalid worker ID format'}, status=400)
                
            worker = Worker.objects.get(
                id=ObjectId(worker_id),
                company_id=request.company_id
            )
            
            batches_data = data.get('batches', '[]')
            try:
                batches = json.loads(batches_data) if batches_data else []
            except json.JSONDecodeError as e:
                return JsonResponse({'success': False, 'message': f'Invalid batches data: {str(e)}'}, status=400)
            
            assignment = MaterialAssignment(
                company_id=request.company_id,
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
    workers = list(Worker.objects.filter(company_id=request.company_id).only('id', 'name', 'image_url'))
    for worker in workers:
        worker.id = str(worker.id)

    assignments = MaterialAssignment.objects.filter(
        company_id=request.company_id
    ).order_by('-assignment_date')

    # Create a list to hold assignment data with worker info
    assignment_data = []
    worker_ids = set()
    
    # First pass: collect all worker IDs
    for assignment in assignments:
        try:
            # Get worker ID as string
            if isinstance(assignment.worker, DBRef):
                worker_id = str(assignment.worker.id)
            else:
                worker_id = str(assignment.worker.id)
            worker_ids.add(worker_id)
        except Exception as e:
            logger.error(f"Error getting worker ID for assignment {assignment.id}: {str(e)}")
            worker_id = "Error"

    # Fetch workers in bulk
    worker_map = {}
    if worker_ids:
        object_ids = [ObjectId(wid) for wid in worker_ids if ObjectId.is_valid(wid)]
        if object_ids:
            workers_list = Worker.objects.filter(
                id__in=object_ids,
                company_id=request.company_id
            ).only('id', 'name')
            for worker in workers_list:
                worker_map[str(worker.id)] = worker

    # Second pass: prepare assignment data
    for assignment in assignments:
        try:
            # Get worker ID as string
            if isinstance(assignment.worker, DBRef):
                worker_id_str = str(assignment.worker.id)
            else:
                worker_id_str = str(assignment.worker.id)
                
            # Get worker object from map
            worker_obj = worker_map.get(worker_id_str)
        except Exception as e:
            logger.error(f"Error processing assignment {assignment.id}: {str(e)}")
            worker_id_str = "Error"
            worker_obj = None

        # Create a dictionary with assignment data
        assignment_data.append({
            'assignment': assignment,
            'worker_id_str': worker_id_str,
            'cached_worker': worker_obj
        })

    return render(request, 'workers/MaterialDistribution.html', {
        'workers': workers,
        'assignments': assignment_data  # Use the prepared data instead
    })


def add_batch_to_assignment(request, assignment_id):
    if request.method == 'POST':
        try:
            if not hasattr(request, 'company_id') or not request.company_id:
                return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
                
            if not ObjectId.is_valid(assignment_id):
                return JsonResponse({'success': False, 'message': 'Invalid assignment ID'}, status=400)
                
            data = json.loads(request.body)
            assignment = MaterialAssignment.objects.get(
                id=ObjectId(assignment_id),
                company_id=request.company_id
            )
            
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
            if not hasattr(request, 'company_id') or not request.company_id:
                return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
                
            if not ObjectId.is_valid(assignment_id):
                return JsonResponse({'success': False, 'message': 'Invalid assignment ID'}, status=400)
                
            assignment = MaterialAssignment.objects.get(
                id=ObjectId(assignment_id),
                company_id=request.company_id
            )
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
            if not hasattr(request, 'company_id') or not request.company_id:
                return JsonResponse({'success': False, 'message': 'Unauthorized'}, status=401)
                
            data = json.loads(request.body)
            record = PayRecord.objects.get(
                id=ObjectId(record_id),
                company_id=request.company_id
            )
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

def get_worker_total_payments(month_start, month_end):
    result = PayRecord.objects.filter(
        date__gte=month_start,
        date__lte=month_end
    ).aggregate(
        total_payments=Sum(F('units_produced') * F('rate_per_unit'))
    )
    return float(result['total_payments'] or 0)
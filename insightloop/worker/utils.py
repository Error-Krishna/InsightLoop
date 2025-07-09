from datetime import datetime
from worker.models import MaterialAssignment, PayRecord, Worker

def create_worker(company_id, worker_data):
    worker = Worker(
        company_id=company_id,
        name=worker_data.get('name'),
        phone=worker_data.get('phone'),
        address=worker_data.get('address'),
        is_active=True
    )
    worker.save()
    return worker

def create_payment(company_id, worker_id, amount, product, units, rate):
    payment = PayRecord(
        company_id=company_id,
        worker=Worker.objects.get(id=worker_id),
        product_name=product,
        units_produced=units,
        rate_per_unit=rate,
        amount_paid=amount,
        paid=(amount >= (units * rate)),
        date=datetime.now()
    )
    payment.save()
    return payment

def assign_material(company_id, worker_id, material_name, quantity, price):
    assignment = MaterialAssignment(
        company_id=company_id,
        worker=Worker.objects.get(id=worker_id),
        material_name=material_name,
        quantity=quantity,
        price_per_unit=price,
        assignment_date=datetime.now()
    )
    assignment.save()
    return assignment
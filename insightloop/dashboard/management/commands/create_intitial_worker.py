from django.core.management.base import BaseCommand
from dashboard.models import Worker

class Command(BaseCommand):
    help = "Create initial worker data"

    def handle(self, *args, **options):
        workers = [
            ("Raj Sharma", "+919876543210"),
            ("Priya Patel", "+919876543211"),
            ("Amit Kumar", "+919876543212"),
            ("Sunita Singh", "+919876543213"),
            ("Vijay Verma", "+919876543214")
        ]
        
        for name, contact in workers:
            # Check if worker exists
            existing_worker = Worker.objects(name=name).first()
            
            if not existing_worker:
                # Create new worker
                Worker(name=name, contact=contact).save()
                self.stdout.write(f"Created worker: {name}")
            else:
                # Update contact if needed
                if existing_worker.contact != contact:
                    existing_worker.contact = contact
                    existing_worker.save()
                    self.stdout.write(f"Updated contact for worker: {name}")
        
        self.stdout.write(self.style.SUCCESS("Initial workers created/updated!"))
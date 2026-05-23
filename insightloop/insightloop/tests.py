import uuid
from datetime import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from bills.models import Bill
from dashboard.models import FinancialSummary
from inventory.models import InventoryItem, Warehouse
from insights.models import Insight
from landing.authentication import issue_tokens_for_user
from landing.mongo_models import Company, User
from upload.models import BusinessData
from worker.models import MaterialAssignment, PayRecord, Worker


class APISmokeTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.suffix = uuid.uuid4().hex[:8]
        cls.email = f"smoke-{cls.suffix}@example.com"
        cls.password = "smoke-test-123"

        cls.company = Company(
            name=f"Smoke Co {cls.suffix}",
            email=cls.email,
            address="Test Address",
            phone="9999999999",
        ).save()
        cls.company_id = str(cls.company.company_id)

        cls.user = User(
            company=cls.company,
            name="Smoke User",
            email=cls.email,
            username=f"smoke-{cls.suffix}",
            phone="9999999999",
        )
        cls.user.set_password(cls.password)
        cls.user.save()

        cls.warehouse = Warehouse(company_id=cls.company_id, name="Main Warehouse", location="Mumbai").save()
        cls.inventory_item = InventoryItem(
            company_id=cls.company_id,
            name="Smoke Inventory",
            unit="pcs",
            type="finished",
            selling_price=120,
            cost_price=80,
            quantity=25,
            reorder_level=10,
            warehouse_id=str(cls.warehouse.id),
            sku="",
        ).save()
        cls.worker = Worker(
            company_id=cls.company_id,
            name="Smoke Worker",
            age=30,
            phone="8888888888",
            address="Worker Address",
            joining_date=datetime(2026, 1, 10),
            is_active=True,
        ).save()
        cls.assignment = MaterialAssignment(
            company_id=cls.company_id,
            worker=cls.worker,
            material_name="Steel",
            quantity=100,
            price_per_unit=12,
            assignment_date=datetime(2026, 5, 10),
            notes="Initial assignment",
        ).save()
        cls.pay_record = PayRecord(
            company_id=cls.company_id,
            worker=cls.worker,
            product_name="Smoke Product",
            units_produced=20,
            rate_per_unit=15,
            amount_paid=0,
            paid=False,
            date=datetime(2026, 5, 12),
        ).save()
        cls.business_data = BusinessData(
            company_id=cls.company_id,
            date=datetime(2026, 5, 15).date(),
            product="Smoke Product",
            category="Electronics",
            quantity=5,
            production_cost=100,
            selling_price=150,
            region="North",
            customer_type="Retail",
        ).save()
        cls.bill = Bill(
            company_id=cls.company_id,
            bill_type="pakka",
            buyer={"name": "Smoke Buyer", "address": "Test City", "gst_number": "22AAAAA0000A1Z5"},
            products=[{"name": "Smoke Product", "quantity": 2, "rate": 150, "unit": "pcs", "total": 300}],
            subtotal=300,
            gst_percentage=18,
            gst_amount=54,
            discount=0,
            grand_total=354,
            invoice_number="",
        ).save()
        cls.insight = Insight(
            company_id=cls.company_id,
            title="Smoke Insight",
            description="Smoke test insight",
            labels=["Jan", "Feb"],
            data_points=[100, 200],
        ).save()
        cls.summary = FinancialSummary(
            company_id=cls.company_id,
            timestamp=datetime(2026, 5, 1),
            total_revenue=1000,
            total_profit=300,
            worker_payments=200,
            active_workers=1,
        ).save()

    @classmethod
    def tearDownClass(cls):
        FinancialSummary.objects(company_id=cls.company_id).delete()
        Insight.objects(company_id=cls.company_id).delete()
        Bill.objects(company_id=cls.company_id).delete()
        BusinessData.objects(company_id=cls.company_id).delete()
        MaterialAssignment.objects(company_id=cls.company_id).delete()
        PayRecord.objects(company_id=cls.company_id).delete()
        Worker.objects(company_id=cls.company_id).delete()
        InventoryItem.objects(company_id=cls.company_id).delete()
        Warehouse.objects(company_id=cls.company_id).delete()
        User.objects(email=cls.email).delete()
        Company.objects(company_id=cls.company_id).delete()
        super().tearDownClass()

    def setUp(self):
        self.client = APIClient()
        access = issue_tokens_for_user(self.user)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_login_endpoint(self):
        client = APIClient()
        response = client.post("/api/v1/auth/login/", {"email": self.email, "password": self.password}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json()["tokens"])

    def test_dashboard_endpoints(self):
        for path in [
            "/api/v1/dashboard/summary/",
            "/api/v1/dashboard/rev-exp/",
            "/api/v1/dashboard/profit-trends/",
            "/api/v1/dashboard/workers/",
            "/api/v1/dashboard/top-workers/",
        ]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)

    def test_inventory_endpoints(self):
        response = self.client.get("/api/v1/inventory/finished/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()), 1)

        response = self.client.get("/api/v1/inventory/warehouses/")
        self.assertEqual(response.status_code, 200)

        response = self.client.get("/api/v1/inventory/meta/warehouse-summary/")
        self.assertEqual(response.status_code, 200)

    def test_workers_endpoints(self):
        response = self.client.get("/api/v1/workers/")
        self.assertEqual(response.status_code, 200)

        detail = self.client.put(
            f"/api/v1/workers/{self.worker.id}/",
            {"name": "Updated Smoke Worker", "is_active": False},
            format="json",
        )
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["name"], "Updated Smoke Worker")

        materials = self.client.get(f"/api/v1/workers/{self.worker.id}/materials/")
        self.assertEqual(materials.status_code, 200)

        payments = self.client.get(f"/api/v1/workers/{self.worker.id}/payments/")
        self.assertEqual(payments.status_code, 200)

    def test_upload_profile_and_settings_endpoints(self):
        upload = self.client.post(
            "/api/v1/upload/manual/",
            {
                "date": "2026-05-20",
                "product": "Manual Upload Product",
                "category": "Electronics",
                "quantity": 3,
                "production_cost": 100,
                "selling_price": 155,
                "region": "North",
                "customer_type": "Retail",
            },
            format="json",
        )
        self.assertEqual(upload.status_code, 201)

        profile = self.client.get("/api/v1/profile/")
        self.assertEqual(profile.status_code, 200)

        settings = self.client.get("/api/v1/profile/settings/")
        self.assertEqual(settings.status_code, 200)
        self.assertIn("workspace_settings", settings.json())

        update = self.client.put(
            "/api/v1/profile/settings/",
            {"ai_assistant_enabled": False, "weekly_summary": True},
            format="json",
        )
        self.assertEqual(update.status_code, 200)
        self.assertFalse(update.json()["workspace_settings"]["ai_assistant_enabled"])
        self.assertTrue(update.json()["notifications"]["weekly_summary"])

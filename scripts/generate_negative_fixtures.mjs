import fs from 'node:fs';
import path from 'node:path';

const fixturesDir = path.resolve('fixtures/negative');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

const negativeFixtures = [
  {
    id: '01_missing_company_id_bill',
    description: 'Bill missing company_id scope',
    endpoint: '/api/v1/bills/pakka',
    method: 'POST',
    payload: {
      buyer: { name: 'Buyer Test' },
      products: [{ name: 'Item', quantity: 1, rate: 100 }],
    },
    expectedStatus: 401, // Missing tenancy auth
    expectedErrorSubstring: 'Authentication credentials were not provided',
  },
  {
    id: '02_invalid_bill_type',
    description: 'Bill with invalid type',
    endpoint: '/api/v1/bills/invalid_type',
    method: 'POST',
    payload: {
      buyer: { name: 'Buyer Test' },
      products: [{ name: 'Item', quantity: 1, rate: 100 }],
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Invalid bill type',
  },
  {
    id: '03_negative_subtotal_bill',
    description: 'Bill with negative product rates or subtotal',
    endpoint: '/api/v1/bills/pakka',
    method: 'POST',
    payload: {
      buyer: { name: 'Buyer Test' },
      products: [{ name: 'Item', quantity: 1, rate: -100 }],
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'rate must be positive',
  },
  {
    id: '04_empty_products_list_bill',
    description: 'Bill with empty products array',
    endpoint: '/api/v1/bills/pakka',
    method: 'POST',
    payload: {
      buyer: { name: 'Buyer Test' },
      products: [],
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'At least one product is required',
  },
  {
    id: '05_negative_product_quantity',
    description: 'Bill product with negative quantity',
    endpoint: '/api/v1/bills/pakka',
    method: 'POST',
    payload: {
      buyer: { name: 'Buyer Test' },
      products: [{ name: 'Item', quantity: -5, rate: 100 }],
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'quantity must be positive',
  },
  {
    id: '06_missing_worker_name',
    description: 'Worker missing required name',
    endpoint: '/api/v1/workers',
    method: 'POST',
    payload: {
      phone: '9999999999',
      address: 'Test Addr',
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Name is required',
  },
  {
    id: '07_negative_worker_age',
    description: 'Worker with negative age',
    endpoint: '/api/v1/workers',
    method: 'POST',
    payload: {
      name: 'Bad Age Worker',
      age: -5,
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Age must be a positive integer',
  },
  {
    id: '08_missing_assignment_material_name',
    description: 'Worker assignment missing material_name',
    endpoint: '/api/v1/workers/670d8a000000000000000030/materials',
    method: 'POST',
    payload: {
      quantity: 10,
      price_per_unit: 50,
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Material name is required',
  },
  {
    id: '09_negative_assignment_quantity',
    description: 'Material assignment with negative quantity',
    endpoint: '/api/v1/workers/670d8a000000000000000030/materials',
    method: 'POST',
    payload: {
      material_name: 'Wood',
      quantity: -10,
      price_per_unit: 50,
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Quantity must be a positive integer',
  },
  {
    id: '10_negative_assignment_price',
    description: 'Material assignment with negative price per unit',
    endpoint: '/api/v1/workers/670d8a000000000000000030/materials',
    method: 'POST',
    payload: {
      material_name: 'Wood',
      quantity: 10,
      price_per_unit: -5,
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Price per unit cannot be negative',
  },
  {
    id: '11_negative_batch_quantity',
    description: 'Batch returned with negative quantity',
    endpoint: '/api/v1/workers/materials/670d8a000000000000000040/batches',
    method: 'POST',
    payload: {
      quantity: -5,
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Batch quantity must be a positive number',
  },
  {
    id: '12_zero_batch_quantity',
    description: 'Batch returned with zero quantity',
    endpoint: '/api/v1/workers/materials/670d8a000000000000000040/batches',
    method: 'POST',
    payload: {
      quantity: 0,
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Batch quantity must be a positive number',
  },
  {
    id: '13_missing_inventory_sku',
    description: 'Inventory item missing required SKU',
    endpoint: '/api/v1/inventory/finished',
    method: 'POST',
    payload: {
      name: 'Item without SKU',
      unit: 'pcs',
      selling_price: 100,
      cost_price: 50,
      quantity: 10,
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'SKU is required',
  },
  {
    id: '14_negative_inventory_quantity',
    description: 'Inventory item with negative initial quantity',
    endpoint: '/api/v1/inventory/finished',
    method: 'POST',
    payload: {
      sku: 'SKU-NEG-1',
      name: 'Negative Stock Item',
      unit: 'pcs',
      selling_price: 100,
      cost_price: 50,
      quantity: -20,
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Quantity cannot be negative',
  },
  {
    id: '15_cross_company_worker_access',
    description: 'Accessing worker belonging to another company (Tenant Isolation)',
    endpoint: '/api/v1/workers/670d8a000000000000000031',
    method: 'GET',
    payload: {},
    expectedStatus: 404,
    expectedErrorSubstring: 'Worker not found',
  },
  {
    id: '16_cross_company_bill_access',
    description: 'Accessing bill belonging to another company',
    endpoint: '/api/v1/bills/670d8a000000000000000099',
    method: 'GET',
    payload: {},
    expectedStatus: 404,
    expectedErrorSubstring: 'Bill not found',
  },
  {
    id: '17_invalid_user_email_signup',
    description: 'User signup with invalid email syntax',
    endpoint: '/api/v1/auth/signup',
    method: 'POST',
    payload: {
      name: 'Test User',
      email: 'not-an-email-address',
      password: 'password123',
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Invalid email',
  },
  {
    id: '18_short_user_password_signup',
    description: 'User signup with password less than 6 characters',
    endpoint: '/api/v1/auth/signup',
    method: 'POST',
    payload: {
      name: 'Test User',
      email: 'valid@example.com',
      password: '123',
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Password must be at least 6 characters',
  },
  {
    id: '19_negative_payment_amount',
    description: 'Recording negative payment amount on bill',
    endpoint: '/api/v1/bills/670d8a000000000000000050/record-payment',
    method: 'POST',
    payload: {
      amount: -100,
      date: new Date().toISOString(),
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Amount must be greater than 0',
  },
  {
    id: '20_zero_payment_amount',
    description: 'Recording zero payment amount on bill',
    endpoint: '/api/v1/bills/670d8a000000000000000050/record-payment',
    method: 'POST',
    payload: {
      amount: 0,
      date: new Date().toISOString(),
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Amount must be greater than 0',
  },
  {
    id: '21_invalid_login_credentials',
    description: 'Login with non-existent account',
    endpoint: '/api/v1/auth/login',
    method: 'POST',
    payload: {
      email: 'nonexistent@example.com',
      password: 'wrongpassword',
    },
    expectedStatus: 401,
    expectedErrorSubstring: 'Invalid email or password',
  },
  {
    id: '22_invalid_warehouse_name',
    description: 'Warehouse creation with empty name',
    endpoint: '/api/v1/inventory/warehouses',
    method: 'POST',
    payload: {
      name: '',
      location: 'Delhi',
    },
    expectedStatus: 400,
    expectedErrorSubstring: 'Name is required',
  },
  {
    id: '23_empty_csv_upload',
    description: 'Uploading empty CSV file',
    endpoint: '/api/v1/upload/csv',
    method: 'POST',
    payload: {},
    expectedStatus: 400,
    expectedErrorSubstring: 'No CSV file provided',
  },
  {
    id: '24_non_existent_insight_delete',
    description: 'Deleting insight that does not exist',
    endpoint: '/api/v1/insights/670d8a000000000000000099',
    method: 'DELETE',
    payload: {},
    expectedStatus: 404,
    expectedErrorSubstring: 'Insight not found',
  },
];

for (const fix of negativeFixtures) {
  const filePath = path.join(fixturesDir, `${fix.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(fix, null, 2), 'utf8');
}

fs.writeFileSync(
  path.join(fixturesDir, 'index.json'),
  JSON.stringify(negativeFixtures, null, 2),
  'utf8'
);

console.log(`Generated ${negativeFixtures.length} negative fixtures in fixtures/negative/`);

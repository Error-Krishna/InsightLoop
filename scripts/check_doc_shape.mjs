import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const pythonBin = path.join(rootDir, '.venv/bin/python');

const require = createRequire(import.meta.url);
const { MongoClient, ObjectId } = require(path.join(rootDir, 'apps/api/node_modules/mongodb'));

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/InsightLoop_test';
const dbName = process.env.MONGODB_DB_NAME || 'InsightLoop_test';

console.log(`[check_doc_shape] Extracting Django MongoEngine model definitions...`);

let schemaJson = '';
try {
  schemaJson = execSync(
    `"${pythonBin}" -c "
import os, sys, django, json
sys.path.insert(0, 'insightloop')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'insightloop.settings')
django.setup()
import mongoengine
import landing.mongo_models
import landing.models
import worker.models
import bills.models
import inventory.models
import upload.models
import dashboard.models
import insights.models

collections = {}
for name, cls in list(mongoengine.base._document_registry.items()):
    if hasattr(cls, '_fields') and not getattr(cls, '_is_base_cls', False):
        coll = getattr(cls, '_meta', {}).get('collection')
        if not coll:
            coll = mongoengine.common._camel_case_to_spaces(cls.__name__).replace(' ', '_')
        fields = {}
        for fname, fval in cls._fields.items():
            db_field = getattr(fval, 'db_field', fname) or fname
            ftype = type(fval).__name__
            fields[db_field] = {
                'name': fname,
                'type': ftype,
                'required': getattr(fval, 'required', False),
            }
        collections[coll] = {
            'model': cls.__name__,
            'collection': coll,
            'fields': fields,
            'strict': not getattr(cls._meta, 'dynamic', False)
        }

print(json.dumps(collections))
"`,
    { cwd: rootDir, encoding: 'utf-8' }
  );
} catch (err) {
  console.error('[check_doc_shape] Failed to extract Django MongoEngine models:', err);
  process.exit(1);
}

const schemas = JSON.parse(schemaJson);
console.log(`[check_doc_shape] Found ${Object.keys(schemas).length} Django MongoEngine models registered.`);

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

let totalErrors = 0;
let checkedDocs = 0;

for (const [collName, schema] of Object.entries(schemas)) {
  const collection = db.collection(collName);
  const count = await collection.countDocuments();
  if (count === 0) continue;

  console.log(`[check_doc_shape] Checking collection '${collName}' (${count} documents)...`);
  const cursor = collection.find({});

  for await (const doc of cursor) {
    checkedDocs++;
    const docId = doc._id ? doc._id.toString() : 'unknown';

    // 1. Extra fields check
    for (const key of Object.keys(doc)) {
      if (!schema.fields[key]) {
        console.error(
          `[ERROR] Extra field '${key}' in collection '${collName}' doc '${docId}' not declared in model ${schema.model}`
        );
        totalErrors++;
      }
    }

    // 2. Type validation for present fields
    for (const [fieldKey, fieldDef] of Object.entries(schema.fields)) {
      const val = doc[fieldKey];
      if (val === undefined || val === null) {
        if (fieldDef.required) {
          console.error(
            `[ERROR] Missing required field '${fieldKey}' in collection '${collName}' doc '${docId}'`
          );
          totalErrors++;
        }
        continue;
      }

      switch (fieldDef.type) {
        case 'ObjectIdField':
        case 'ReferenceField': {
          if (!(val instanceof ObjectId)) {
            console.error(
              `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected ObjectId but got ${typeof val} (${JSON.stringify(val)})`
            );
            totalErrors++;
          }
          break;
        }
        case 'DateTimeField':
        case 'DateField': {
          if (!(val instanceof Date) || isNaN(val.getTime())) {
            console.error(
              `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected BSON Date but got ${typeof val} (${JSON.stringify(val)})`
            );
            totalErrors++;
          }
          break;
        }
        case 'IntField': {
          if (typeof val !== 'number' || !Number.isInteger(val)) {
            console.error(
              `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected integer but got ${val}`
            );
            totalErrors++;
          }
          break;
        }
        case 'FloatField':
        case 'DecimalField': {
          if (typeof val !== 'number' && typeof val !== 'object') {
            console.error(
              `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected number/Decimal but got ${typeof val}`
            );
            totalErrors++;
          }
          break;
        }
        case 'BooleanField': {
          if (typeof val !== 'boolean') {
            console.error(
              `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected boolean but got ${typeof val}`
            );
            totalErrors++;
          }
          break;
        }
        case 'StringField':
        case 'EmailField': {
          if (typeof val !== 'string') {
            console.error(
              `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected string but got ${typeof val}`
            );
            totalErrors++;
          }
          break;
        }
        case 'ListField': {
          if (!Array.isArray(val)) {
            console.error(
              `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected Array but got ${typeof val}`
            );
            totalErrors++;
          }
          break;
        }
        case 'DictField': {
          if (typeof val !== 'object' || Array.isArray(val)) {
            console.error(
              `[ERROR] Field '${fieldKey}' in collection '${collName}' doc '${docId}' expected Object but got ${typeof val}`
            );
            totalErrors++;
          }
          break;
        }
      }
    }
  }
}

await client.close();

console.log(`[check_doc_shape] Checked ${checkedDocs} documents across collections.`);
if (totalErrors > 0) {
  console.error(`[check_doc_shape] FAILED with ${totalErrors} schema mismatch error(s).`);
  process.exit(1);
} else {
  console.log(`[check_doc_shape] PASSED: All checked documents conform strictly to Django MongoEngine models.`);
  process.exit(0);
}

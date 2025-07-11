from mongoengine import Document, StringField, DictField

class UserSocialAuth(Document):
    provider = StringField(max_length=32)
    uid = StringField(max_length=255)
    user_id = StringField()
    extra_data = DictField()

    meta = {
        'indexes': [
            {'fields': ['provider', 'uid'], 'unique': True}
        ]
    }

class Nonce(Document):
    server_url = StringField(max_length=255)
    timestamp = StringField()
    salt = StringField(max_length=40)

class Association(Document):
    server_url = StringField(max_length=255)
    handle = StringField(max_length=255)
    secret = StringField(max_length=255)
    issued = StringField()
    lifetime = StringField()
    assoc_type = StringField(max_length=64)
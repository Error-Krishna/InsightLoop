from mongoengine import Document, StringField, DictField
from social_core.storage import UserMixin, NonceMixin, AssociationMixin, BaseStorage

class UserSocialAuth(Document, UserMixin):
    """Social Auth association model - MongoDB version"""
    user_id = StringField(required=True)
    provider = StringField(max_length=32, required=True)
    uid = StringField(max_length=255, required=True)
    extra_data = DictField()

    @classmethod
    def get_social_auth(cls, provider, uid):
        try:
            return cls.objects.get(provider=provider, uid=uid)
        except cls.DoesNotExist:
            return None

    @classmethod
    def username_max_length(cls):
        return 255  # Default value, adjust if needed

    @classmethod
    def create_social_auth(cls, user, uid, provider):
        return cls(user_id=str(user.id), uid=uid, provider=provider)

    class Meta:
        unique_together = ('provider', 'uid')

class Nonce(Document, NonceMixin):
    """One use numbers"""
    server_url = StringField(max_length=255, required=True)
    timestamp = StringField(required=True)
    salt = StringField(max_length=40, required=True)

class Association(Document, AssociationMixin):
    """OpenId account association"""
    server_url = StringField(max_length=255, required=True)
    handle = StringField(max_length=255, required=True)
    secret = StringField(max_length=255, required=True)  # Stored as base64
    issued = StringField(required=True)
    lifetime = StringField(required=True)
    assoc_type = StringField(max_length=64, required=True)

class MongoEngineStorage(BaseStorage):
    user = UserSocialAuth
    nonce = Nonce
    association = Association
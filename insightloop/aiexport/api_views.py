from rest_framework.response import Response

from insightloop.api_utils import AuthenticatedAPIView, get_company_id

from .ai_processor import process_ai_command


class AIConfigApiView(AuthenticatedAPIView):
    def get(self, request):
        return Response(
            {
                "websocket_path": "/ws/ai-assistant/",
                "starter_prompts": [
                    "Export business trends",
                    "Show me revenue trends",
                    "Show worker productivity",
                ],
            }
        )


class AICommandApiView(AuthenticatedAPIView):
    def post(self, request):
        command = request.data.get("command", "")
        assistant = request.data.get("assistant", "jarvis")
        result = process_ai_command(get_company_id(request), request.user.email, command, assistant)
        return Response(result)

import unittest
import inspect
from unittest.mock import AsyncMock
from unittest.mock import patch

from fastapi import HTTPException

from app import security


class TestSecurityHardening(unittest.TestCase):
    def test_guest_operator_is_rejected_by_default(self):
        checker = security.require_role("operator", allow_guest_operator=True)
        with self.assertRaises(HTTPException) as raised:
            checker(token=None, db=None)
        self.assertEqual(raised.exception.status_code, 401)

    def test_guest_operator_can_only_be_enabled_in_non_production(self):
        checker = security.require_role("operator", allow_guest_operator=True)
        with patch.object(security, "ALLOW_GUEST_OPERATOR", True):
            self.assertEqual(checker(token=None, db=None)["sub"], "guest_operator")
        with patch.object(security, "ENV", "production"), patch.object(
            security, "ALLOW_GUEST_OPERATOR", False
        ):
            with self.assertRaises(HTTPException) as raised:
                checker(token=None, db=None)
        self.assertEqual(raised.exception.status_code, 401)

    def test_invalid_tokens_do_not_expose_jwt_error(self):
        with self.assertRaises(HTTPException) as raised:
            security.validate_token("not-a-token")
        self.assertEqual(raised.exception.detail, "Invalid authentication token")

    def test_stream_requires_a_token(self):
        from app.main import camera_stream

        with self.assertRaises(HTTPException) as raised:
            camera_stream("cam-1", None, None)
        self.assertEqual(raised.exception.status_code, 401)

    def test_websocket_requires_a_token(self):
        from app.main import ws_alerts

        websocket = AsyncMock()
        import asyncio

        asyncio.run(ws_alerts(websocket, token=None))
        websocket.close.assert_awaited_once_with(code=1008)

    def test_camera_toggle_requires_admin_role(self):
        from app.main import toggle_camera

        dependency = inspect.signature(toggle_camera).parameters["user_payload"].default.dependency
        operator_token = security.create_access_token("operator", "operator")
        with self.assertRaises(HTTPException) as raised:
            dependency(token=operator_token, db=None)
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()

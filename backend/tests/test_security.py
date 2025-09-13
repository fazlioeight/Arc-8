from app.utils.security import create_access_token, decode_token


def test_token_roundtrip():
    token = create_access_token({"sub": "user@example.com", "tid": "demo"})
    payload = decode_token(token)
    assert payload["sub"] == "user@example.com"
    assert payload["tid"] == "demo"


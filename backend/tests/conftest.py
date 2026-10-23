import pytest


@pytest.fixture(autouse=True)
def isolated_model_memory(tmp_path, monkeypatch):
    """Tests must never write the real data/last_model.txt."""
    from app import config
    monkeypatch.setattr(config, "LAST_MODEL_FILE", tmp_path / "last_model.txt")

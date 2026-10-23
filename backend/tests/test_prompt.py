import argparse

from app.schemas import HuntRequest
from app.services.agent import build_prompt


def args(**kw):
    base = dict(budget=200, max_carts=6, diet="veg", address="Home", queries="thali, biryani")
    base.update(kw)
    return argparse.Namespace(**base)


def test_prompt_carries_the_extra_item_allowance():
    assert "add up to 2 extra item(s)" in build_prompt(args(extra_items=2))
    zero = build_prompt(args(extra_items=0))
    assert "add up to 0 extra item(s)" in zero
    assert "{" not in zero.replace("{}", "")        # every placeholder was filled


def test_extra_items_default_and_limits():
    assert HuntRequest().extra_items == 2
    for bad in (-1, 4):
        try:
            HuntRequest(extra_items=bad)
        except ValueError:
            continue
        raise AssertionError("out-of-range extra_items accepted")

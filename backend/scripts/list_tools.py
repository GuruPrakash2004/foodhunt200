"""List every tool the Zomato and Swiggy MCP servers offer, with its description and input schema.

READ-ONLY: it asks each server what tools it has and prints them. It never calls a tool, so nothing is added to a cart
or ordered. Run from backend/:   PYTHONPATH=. .venv/bin/python scripts/list_tools.py > tools.json
"""
import asyncio
import json
from contextlib import AsyncExitStack

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app import config
from app.services.oauth import make_oauth


async def main() -> None:
    out = {}
    async with AsyncExitStack() as stack:
        for name, cfg in config.PLATFORMS.items():
            try:
                auth = make_oauth(name, cfg["url"], cfg["port"], cfg["client_id"], cfg["client_secret"])
                read, write, _ = await stack.enter_async_context(streamablehttp_client(cfg["url"], auth=auth))
                session = await stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
                out[name] = [{"name": t.name, "description": t.description, "inputSchema": t.inputSchema}
                             for t in (await session.list_tools()).tools]
            except BaseException as e:  # one platform failing shouldn't hide the other
                out[name] = f"could not connect: {type(e).__name__}: {e}"
    print(json.dumps(out, indent=2, ensure_ascii=False))


asyncio.run(asyncio.wait_for(main(), 90))

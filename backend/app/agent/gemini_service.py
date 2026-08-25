import os
import json
import asyncio
import logging
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger("razoragent.gemini")

# A hung LLM call must not hold a checkout open. Past this, callers fall back to
# the deterministic engine.
GENERATION_TIMEOUT_SECONDS = 12.0


class GeminiService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
        self.model_name = settings.GEMINI_MODEL
        self.client = None

        if self.api_key:
            try:
                from google import genai
                self.client = genai.Client(api_key=self.api_key)
                logger.info(f"Gemini client initialized using model '{self.model_name}'")
            except Exception as e:
                logger.warning(f"Could not initialize Google GenAI client: {e}. Using deterministic engine.")

    @property
    def is_active(self) -> bool:
        return self.client is not None

    def _sync_generate(self, config: Dict[str, Any], user_prompt: str) -> str:
        """Blocking genai call, run off the event loop via asyncio.to_thread()."""
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=user_prompt,
            config=config,
        )
        return response.text

    async def generate_response(
        self,
        system_instruction: str,
        user_prompt: str,
        response_schema: Optional[Dict[str, Any]] = None,
        temperature: float = 0.2,
    ) -> Optional[str]:
        """
        Calls Gemini and returns raw text, or None if the model is unavailable,
        times out, or errors — every caller has a deterministic fallback.
        """
        if not self.client:
            return None

        config: Dict[str, Any] = {
            "system_instruction": system_instruction,
            "temperature": temperature,
        }
        if response_schema:
            # Constrained decoding: the model is held to this shape rather than
            # merely asked for JSON in the prompt.
            config["response_mime_type"] = "application/json"
            config["response_schema"] = response_schema

        try:
            return await asyncio.wait_for(
                asyncio.to_thread(self._sync_generate, config, user_prompt),
                timeout=GENERATION_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning(f"Gemini call exceeded {GENERATION_TIMEOUT_SECONDS}s; using the deterministic engine.")
            return None
        except Exception as e:
            logger.error(f"Gemini API generation error: {e}")
            return None

    async def generate_json(
        self,
        system_instruction: str,
        user_prompt: str,
        response_schema: Dict[str, Any],
        temperature: float = 0.2,
    ) -> Optional[Dict[str, Any]]:
        """Same as generate_response, but parses the reply. None on any failure."""
        raw = await self.generate_response(
            system_instruction=system_instruction,
            user_prompt=user_prompt,
            response_schema=response_schema,
            temperature=temperature,
        )
        if not raw:
            return None

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.warning(f"Gemini returned unparseable JSON ({e}); using the deterministic engine.")
            return None

        return parsed if isinstance(parsed, dict) else None


gemini_service = GeminiService()

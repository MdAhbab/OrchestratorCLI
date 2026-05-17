"""
IBM Watson Services for Speech-to-Text and Watsonx.ai integration.
Loads credentials from environment configuration.

Note: IBM Watson libraries require Python 3.10-3.12. If using Python 3.13,
these services will be disabled with graceful fallback.
"""

import logging
from typing import Optional, Dict, Any, BinaryIO

# Try to import IBM Watson libraries - they may not be installed with Python 3.13
try:
    from ibm_watson import SpeechToTextV1
    from ibm_cloud_sdk_core.authenticators import IAMAuthenticator
    from ibm_watsonx_ai import APIClient, Credentials
    try:
        from ibm_watsonx_ai.foundation_models import ModelInference as _WxModel  # type: ignore
    except ImportError:
        from ibm_watsonx_ai.foundation_models import Model as _WxModel  # type: ignore
    IBM_WATSON_AVAILABLE = True
except ImportError:
    _WxModel = None  # type: ignore
    IBM_WATSON_AVAILABLE = False

from backend.config import settings
from backend.utils.exceptions import ServiceError

logger = logging.getLogger(__name__)

if not IBM_WATSON_AVAILABLE:
    logger.warning(
        "IBM Watson libraries not installed. "
        "Speech-to-Text and Watsonx.ai services will be disabled. "
        "To enable, use Python 3.10-3.12 and run: "
        "pip install ibm-watson ibm-watsonx-ai numpy pandas"
    )


class SpeechToTextService:
    """Service for IBM Watson Speech-to-Text functionality."""
    
    def __init__(self):
        """Initialize Speech-to-Text service with credentials from config."""
        if not IBM_WATSON_AVAILABLE:
            raise ServiceError(
                "IBM Watson libraries are not available in this environment. "
                "Speech-to-Text service is disabled."
            )
            
        if not settings.stt_api_key or not settings.stt_url:
            raise ServiceError(
                "Speech-to-Text credentials not configured. "
                "Please set STT_API_KEY and STT_URL in environment variables."
            )
        
        try:
            authenticator = IAMAuthenticator(settings.stt_api_key)
            self.service = SpeechToTextV1(authenticator=authenticator)
            self.service.set_service_url(settings.stt_url)
            logger.info("Speech-to-Text service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Speech-to-Text service: {e}")
            raise ServiceError(f"Speech-to-Text initialization failed: {str(e)}")
    
    def transcribe_audio(
        self,
        audio_file: BinaryIO,
        content_type: str = "audio/wav",
        model: str = "en-US_BroadbandModel",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Transcribe audio to text.
        
        Args:
            audio_file: Audio file binary stream
            content_type: MIME type of audio (e.g., 'audio/wav', 'audio/mp3')
            model: Speech recognition model to use
            **kwargs: Additional parameters for the API
            
        Returns:
            Dictionary containing transcription results
            
        Raises:
            ServiceError: If transcription fails
        """
        try:
            logger.info(f"Transcribing audio with model: {model}")
            response = self.service.recognize(
                audio=audio_file,
                content_type=content_type,
                model=model,
                **kwargs
            ).get_result()
            
            logger.info("Audio transcription completed successfully")
            return response
        except Exception as e:
            logger.error(f"Audio transcription failed: {e}")
            raise ServiceError(f"Transcription failed: {str(e)}")
    
    def get_transcript_text(self, response: Dict[str, Any]) -> str:
        """
        Extract plain text from transcription response.
        
        Args:
            response: Response from transcribe_audio method
            
        Returns:
            Concatenated transcript text
        """
        try:
            results = response.get("results", [])
            transcript = " ".join(
                alternative["transcript"]
                for result in results
                for alternative in result.get("alternatives", [])
            )
            return transcript.strip()
        except Exception as e:
            logger.error(f"Failed to extract transcript text: {e}")
            return ""
    
    def list_models(self) -> Dict[str, Any]:
        """
        List available speech recognition models.
        
        Returns:
            Dictionary containing available models
            
        Raises:
            ServiceError: If listing models fails
        """
        try:
            logger.info("Fetching available Speech-to-Text models")
            response = self.service.list_models().get_result()
            return response
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            raise ServiceError(f"Failed to list models: {str(e)}")


class WatsonxService:
    """Service for IBM Watsonx.ai foundation models."""
    
    def __init__(self):
        """Initialize Watsonx.ai service with credentials from config."""
        if not IBM_WATSON_AVAILABLE:
            raise ServiceError(
                "IBM Watsonx.ai libraries are not available in this environment. "
                "Watsonx.ai service is disabled."
            )
            
        if not settings.watsonx_api_key or not settings.watsonx_project_id:
            raise ServiceError(
                "Watsonx.ai credentials not configured. "
                "Please set WATSONX_API_KEY and WATSONX_PROJECT_ID in environment variables."
            )
        
        try:
            self.credentials = Credentials(
                api_key=settings.watsonx_api_key,
                url="https://us-south.ml.cloud.ibm.com"
            )
            self.project_id = settings.watsonx_project_id
            # APIClient construction is lazy and expensive; only build it if asked.
            self._client: Optional[Any] = None
            self._model_cache: Dict[str, Any] = {}
            logger.info("Watsonx.ai credentials configured")
        except Exception as e:
            logger.error(f"Failed to initialize Watsonx.ai service: {e}")
            raise ServiceError(f"Watsonx.ai initialization failed: {str(e)}")

    @property
    def client(self) -> Any:
        """Lazily build the APIClient. Avoids paying the cost on import."""
        if self._client is None:
            self._client = APIClient(self.credentials)
        return self._client

    def _get_model(self, model_id: str, parameters: Dict[str, Any]) -> Any:
        """Cache one model per (model_id, params signature)."""
        signature = (model_id, tuple(sorted(parameters.items())))
        cached = self._model_cache.get(repr(signature))
        if cached is not None:
            return cached
        model = _WxModel(
            model_id=model_id,
            params=parameters,
            credentials=self.credentials,
            project_id=self.project_id,
        )
        self._model_cache[repr(signature)] = model
        return model
    
    def generate_text(
        self,
        prompt: str,
        model_id: str = "ibm/granite-13b-chat-v2",
        parameters: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> str:
        """
        Generate text using a Watsonx.ai foundation model.
        
        Args:
            prompt: Input prompt for text generation
            model_id: Model identifier (e.g., 'ibm/granite-13b-chat-v2')
            parameters: Generation parameters (temperature, max_tokens, etc.)
            **kwargs: Additional parameters
            
        Returns:
            Generated text response
            
        Raises:
            ServiceError: If text generation fails
        """
        try:
            logger.info(f"Generating text with model: {model_id}")
            
            default_params = {
                "decoding_method": "greedy",
                "max_new_tokens": 500,
                "temperature": 0.7,
                "top_k": 50,
                "top_p": 1.0,
            }
            if parameters:
                default_params.update(parameters)
            
            model = self._get_model(model_id, default_params)
            response = model.generate_text(prompt=prompt, **kwargs)
            
            # ModelInference returns either a str (when `raw_response=False`) or a dict.
            if isinstance(response, dict):
                results = response.get("results") or []
                if results and isinstance(results[0], dict):
                    return str(results[0].get("generated_text", ""))
                return ""
            return str(response)
        except Exception as e:
            logger.error(f"Text generation failed: {e}")
            raise ServiceError(f"Text generation failed: {str(e)}")
    
    def generate_text_stream(
        self,
        prompt: str,
        model_id: str = "ibm/granite-13b-chat-v2",
        parameters: Optional[Dict[str, Any]] = None,
        **kwargs
    ):
        """
        Generate text using streaming for real-time responses.
        
        Args:
            prompt: Input prompt for text generation
            model_id: Model identifier
            parameters: Generation parameters
            **kwargs: Additional parameters
            
        Yields:
            Text chunks as they are generated
            
        Raises:
            ServiceError: If streaming fails
        """
        try:
            logger.info(f"Starting streaming text generation with model: {model_id}")
            default_params = {
                "decoding_method": "greedy",
                "max_new_tokens": 500,
                "temperature": 0.7,
                "top_k": 50,
                "top_p": 1.0,
            }
            if parameters:
                default_params.update(parameters)
            model = self._get_model(model_id, default_params)

            # ModelInference returns an iterator of strings (text tokens) when stream=True.
            for chunk in model.generate_text_stream(prompt=prompt, **kwargs):
                if isinstance(chunk, dict):
                    # Granite streams a `generated_text` field
                    text = chunk.get("generated_text") or chunk.get("results", [{}])[0].get("generated_text", "")
                    if text:
                        yield text
                elif isinstance(chunk, str) and chunk:
                    yield chunk
            
            logger.info("Streaming text generation completed")
        except Exception as e:
            logger.error(f"Streaming text generation failed: {e}")
            raise ServiceError(f"Streaming failed: {str(e)}")
    
    def list_models(self) -> Dict[str, Any]:
        """
        List available foundation models.
        
        Returns:
            Dictionary containing available models
            
        Raises:
            ServiceError: If listing models fails
        """
        try:
            logger.info("Fetching available Watsonx.ai models")
            models = self.client.foundation_models.get_model_specs()
            return {"models": models}
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            raise ServiceError(f"Failed to list models: {str(e)}")


# Singleton instances (lazy initialization)
_stt_service: Optional[SpeechToTextService] = None
_watsonx_service: Optional[WatsonxService] = None


def get_stt_service() -> SpeechToTextService:
    """
    Get or create Speech-to-Text service instance.
    
    Returns:
        SpeechToTextService instance
    """
    global _stt_service
    if _stt_service is None:
        _stt_service = SpeechToTextService()
    return _stt_service


def get_watsonx_service() -> WatsonxService:
    """
    Get or create Watsonx.ai service instance.
    
    Returns:
        WatsonxService instance
    """
    global _watsonx_service
    if _watsonx_service is None:
        _watsonx_service = WatsonxService()
    return _watsonx_service

# Made with Bob

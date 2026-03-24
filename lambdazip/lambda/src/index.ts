import * as Alexa from 'ask-sdk-core';
import { S3PersistenceAdapter } from 'ask-sdk-s3-persistence-adapter';
import * as AWS from 'aws-sdk';

// ── S3 helpers ────────────────────────────────────────────────────────────────

const s3SigV4Client = new AWS.S3({ signatureVersion: 'v4' });
const AUDIO_FILE_KEY = 'brown_noise_12h.mp3';

function getS3PreSignedUrl(s3ObjectKey: string): string {
  const bucketName = process.env.S3_PERSISTENCE_BUCKET;
  return s3SigV4Client.getSignedUrl('getObject', {
    Bucket: bucketName,
    Key: `Media/${s3ObjectKey}`,
    Expires: 60 * 60 * 24, // 24 hours
  });
}

function generateToken(): string {
  return `brown-noise-${Date.now()}`;
}

// ── Playback ──────────────────────────────────────────────────────────────────

const LaunchRequestHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const audioUrl = getS3PreSignedUrl(AUDIO_FILE_KEY);
    const token = generateToken();

    return handlerInput.responseBuilder
      .speak('Starting brown noise.')
      .addAudioPlayerPlayDirective('REPLACE_ALL', audioUrl, token, 0)
      .withShouldEndSession(true)
      .getResponse();
  },
};

const ResumeIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.ResumeIntent'
    );
  },
  async handle(handlerInput) {
    const audioUrl = getS3PreSignedUrl(AUDIO_FILE_KEY);
    const token = generateToken();

    const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();
    const offsetInMilliseconds = (persistentAttributes.offsetInMilliseconds as number) ?? 0;

    return handlerInput.responseBuilder
      .addAudioPlayerPlayDirective('REPLACE_ALL', audioUrl, token, offsetInMilliseconds)
      .withShouldEndSession(true)
      .getResponse();
  },
};

// ── Stop / Pause / Cancel ─────────────────────────────────────────────────────

const PauseIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      ['AMAZON.PauseIntent', 'AMAZON.StopIntent', 'AMAZON.CancelIntent'].includes(
        Alexa.getIntentName(handlerInput.requestEnvelope),
      )
    );
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const builder = handlerInput.responseBuilder.addAudioPlayerStopDirective();

    // Alexa spec: don't return speech for PauseIntent during AudioPlayer playback
    if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') {
      builder.speak('Stopping brown noise.');
    }

    return builder.getResponse();
  },
};

// ── Informational intents ─────────────────────────────────────────────────────

const HelpIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(
        'Just Brown Noise plays continuous brown noise. ' +
          'Say stop to end playback, or ask Alexa to set a sleep timer. ' +
          'Would you like me to start playing?',
      )
      .reprompt('Say start to begin, or stop to end.')
      .getResponse();
  },
};

const FallbackIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Just Brown Noise can only play brown noise. Say stop to end, or say start to begin.')
      .getResponse();
  },
};

// ── Unsupported intents (required for certification) ──────────────────────────

const UNSUPPORTED_INTENTS = [
  'AMAZON.NextIntent',
  'AMAZON.PreviousIntent',
  'AMAZON.RepeatIntent',
  'AMAZON.ShuffleOnIntent',
  'AMAZON.ShuffleOffIntent',
  'AMAZON.LoopOnIntent',
  'AMAZON.LoopOffIntent',
  'AMAZON.StartOverIntent',
  'AMAZON.NavigateHomeIntent',
];

const UnsupportedIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      UNSUPPORTED_INTENTS.includes(Alexa.getIntentName(handlerInput.requestEnvelope))
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak("Sorry, I can't do that with brown noise.")
      .getResponse();
  },
};

// ── AudioPlayer event handlers (required for certification) ───────────────────

const PlaybackStartedHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStarted'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const PlaybackFinishedHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFinished'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const PlaybackStoppedHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackStopped'
    );
  },
  async handle(handlerInput) {
    const offsetInMilliseconds =
      handlerInput.requestEnvelope.context.AudioPlayer?.offsetInMilliseconds ?? 0;

    handlerInput.attributesManager.setPersistentAttributes({ offsetInMilliseconds });
    await handlerInput.attributesManager.savePersistentAttributes();

    return handlerInput.responseBuilder.getResponse();
  },
};

// Seamless looping: enqueue the same file before the current play finishes
const PlaybackNearlyFinishedHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      'AudioPlayer.PlaybackNearlyFinished'
    );
  },
  handle(handlerInput) {
    const audioUrl = getS3PreSignedUrl(AUDIO_FILE_KEY);
    // expectedPreviousToken must match the currently-playing token exactly
    const currentToken = handlerInput.requestEnvelope.context.AudioPlayer?.token ?? '';
    const nextToken = generateToken();

    return handlerInput.responseBuilder
      .addAudioPlayerPlayDirective('ENQUEUE', audioUrl, nextToken, 0, currentToken)
      .getResponse();
  },
};

const PlaybackFailedHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackFailed'
    );
  },
  handle(handlerInput) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = (handlerInput.requestEnvelope.request as any).error;
    console.error('AudioPlayer.PlaybackFailed:', JSON.stringify(error));
    return handlerInput.responseBuilder.getResponse();
  },
};

// ── Session / Error ───────────────────────────────────────────────────────────

const SessionEndedRequestHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const GlobalErrorHandler: Alexa.ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Unhandled error:', JSON.stringify(error));
    return handlerInput.responseBuilder
      .speak('Sorry, something went wrong. Please try again.')
      .getResponse();
  },
};

// ── Skill builder ─────────────────────────────────────────────────────────────

const persistenceAdapter = new S3PersistenceAdapter({
  bucketName: process.env.S3_PERSISTENCE_BUCKET ?? '',
});

export const handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    ResumeIntentHandler,
    PauseIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler,
    UnsupportedIntentHandler,
    PlaybackStartedHandler,
    PlaybackFinishedHandler,
    PlaybackStoppedHandler,
    PlaybackNearlyFinishedHandler,
    PlaybackFailedHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(GlobalErrorHandler)
  .withPersistenceAdapter(persistenceAdapter)
  .lambda();

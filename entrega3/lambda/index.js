const Alexa = require('ask-sdk-core');

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {

        const speakOutput = '¡Bienvenido a <lang xml:lang="en-US">Escape Room Creator</lang>! Puedes decir: "iniciar juego", para escuchar la narrativa';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const IniciarJuegoIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'IniciarJuego';
    },
    handle(handlerInput) {
        const speakOutput = `Has despertado en una habitación oscura.
        No recuerdas cómo has llegado hasta aquí.
        Las paredes son lisas, grises, sin ventanas. Solo una puerta cerrada y una luz tenue parpadeando sobre tu cabeza.
        De repente, escuchas una voz metálica que retumba por la estancia.
        <break time="1s"/>
        Bienvenido, jugador. Estás atrapado en lo que llamamos <lang xml:lang="en-US">Escape Room Creator</lang>.
        Aquí pondremos a prueba tu ingenio, tu lógica... y tu paciencia.
        Tu misión es simple. Salir. Tu única herramienta… tu mente.
        Para conseguirlo, deberás superar tres desafíos.
        El primer desafío...
        El segundo desafío...
        Y finalmente, el tercer desafío....
        <break time="1s"/>
        No hay límite de tiempo. No hay ayuda exterior. Solo tú... y tu voz.
        Cuando estés listo para empezar... solo dilo.
        Tu aventura comienza cuando tú lo decidas.
        <break time="1s"/>
        ¿Qué quieres hacer ahora?`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('¿Qué quieres hacer ahora?')
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'No he entendido lo que has dicho. Puedes decir: "iniciar juego" para empezar.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('¿Qué quieres hacer ahora?')
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Adiós, espero que vuelvas a intentarlo pronto.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Estás dentro de Escape Room Creator. Puedes decir: "iniciar juego" para comenzar la narrativa. También puedes decir "salir" para abandonar. ¿Qué quieres hacer?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('¿Qué quieres hacer ahora?')
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        IniciarJuegoIntentHandler,
        CancelAndStopIntentHandler,
        HelpIntentHandler,
        FallbackIntentHandler
    )
    .lambda();
const Alexa = require('ask-sdk-core');

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {

        const speakOutput = '¡Bienvenido a <lang xml:lang="en-US">Escape Room Creator</lang>! Puedes decir: "iniciar juego" para comenzar la narrativa. También puedes decir "salir del juego" para abandonar.';
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
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.estado = 'jugando';
        sessionAttributes.desafioActual = 1;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        const speakOutput = `Has despertado en una habitación oscura.
        No recuerdas cómo has llegado hasta aquí.
        Las paredes son lisas, grises, sin ventanas. Solo una puerta cerrada y una luz tenue parpadeando sobre tu cabeza.
        De repente, escuchas una voz metálica que retumba por la estancia.
        <break time="1s"/>
        Bienvenido, jugador. Estás atrapado en lo que llamamos <lang xml:lang="en-US">Escape Room Creator</lang>.
        Aquí pondremos a prueba tu ingenio, tu lógica... y tu paciencia.
        Tu misión es simple. Salir. Tu única herramienta… tu mente.
        Deberás superar tres desafíos. El primero comienza ahora:
        <break time="1s"/>
        Es un mensaje cifrado con código César.
        La pista es: Se empieza así en todos los lenguajes de programación.
        El mensaje cifrado es: 
        O V S H   T B U K V.
        ¿Qué dice el mensaje?`;

        const codigoACifrar = "O V S H   T B U K V";

        return handlerInput.responseBuilder
        .speak(speakOutput)
        .addDirective({
            type: 'Alexa.Presentation.HTML.Start',
            request: {
            uri: 'https://d1qeen6fmshz39.cloudfront.net/entrega3/puzles/cifrado_cesar.html',
            method: 'GET',
            },
            configuration: {
            timeoutInSeconds: 300,
            },
            data: {
            mensajeCifrado: codigoACifrar
            }
        })
        .reprompt('¿Cuál es tu respuesta?')
        .getResponse();
    }
};

const ResolverPuzzleIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ResolverPuzzleIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const userAnswer = (handlerInput.requestEnvelope.request.intent.slots.respuestaUsuario.value || '').toLowerCase();

        let speakOutput = '';
        let shouldEndSession = false;

        if (sessionAttributes.estado !== 'jugando') {
            speakOutput = 'Aún no has iniciado un juego. Di "iniciar juego" para comenzar.';
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt('¿Quieres iniciar el juego?')
                .getResponse();
        }

        switch (sessionAttributes.desafioActual) {
            case 1:
                if (userAnswer.includes('miro') && userAnswer.includes('pizarra')) {
                    sessionAttributes.desafioActual = 2;
                    speakOutput = `Correcto. Has resuelto el mensaje. Encuentras una llave detrás de la pizarra.
                    Pasemos al segundo desafío.
                    <break time="1s"/>
                    Escucha atentamente: 
                    No pesa nada, pero si lo pones en una caja, esta se vuelve más ligera. ¿Qué es?`;
                } else {
                    speakOutput = 'Eso no parece correcto. Pista: la clave es el número de días de la semana. Intenta de nuevo.';
                }
                break;

            case 2:
                if (userAnswer.includes('hueco') || userAnswer.includes('vacío')) {
                    sessionAttributes.desafioActual = 3;
                    speakOutput = `Correcto. El vacío no pesa nada.
                    Pasemos al tercer y último desafío.
                    <break time="1s"/>
                    Escucha: 
                    Si 2 más 2 es igual a 4, y 3 más 3 es igual a 6, entonces 10 más 10 es...`;
                } else {
                    speakOutput = 'Pista: no es algo físico. Intenta otra vez.';
                }
                break;

            case 3:
                if (userAnswer.includes('20')) {
                    sessionAttributes.estado = 'completado';
                    speakOutput = `Correcto. Has completado los tres desafíos.
                    Una puerta se abre lentamente frente a ti.
                    Has logrado escapar. ¡Enhorabuena, escapista!`;
                } else {
                    speakOutput = 'No es complicado. ¿Cuánto es diez más diez?';
                }
                break;

            default:
                speakOutput = 'Aún no has iniciado un desafío. Di "iniciar juego".';
                break;
        }

        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        const responseBuilder = handlerInput.responseBuilder.speak(speakOutput);
        if (shouldEndSession) {
            return responseBuilder.withShouldEndSession(true).getResponse();
        } else {
            return responseBuilder.reprompt('¿Cuál es tu respuesta?').getResponse();
        }
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
          && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  
      let speakOutput = '';
      let repromptOutput = '';
  
      if (sessionAttributes.estado === 'jugando') {
        const desafio = sessionAttributes.desafioActual || 1;
        speakOutput = `No he entendido tu respuesta. Recuerda que estás en el desafío número ${desafio}. Por favor, responde diciendo "la respuesta es..." seguido de tu solución.`;
        repromptOutput = `Intenta responder al desafío ${desafio} o pide ayuda.`;
      } else if (sessionAttributes.estado === 'terminado') {
        speakOutput = 'Has completado todos los desafíos. Gracias por jugar. Si quieres iniciar de nuevo, dime "iniciar juego".';
        repromptOutput = '¿Quieres jugar otra vez?';
      } else {
        speakOutput = 'No he entendido eso. Puedes decir "iniciar juego" para comenzar.';
        repromptOutput = '¿Quieres iniciar el juego?';
      }
  
      return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt(repromptOutput)
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
            .withShouldEndSession(true)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        let speakOutput = '';
        let repromptOutput = '';

        if (sessionAttributes.estado === 'jugando') {
        speakOutput = 'Estás en medio del juego. Para avanzar, debes resolver el desafío actual. Puedes responder diciendo "la respuesta es..." y tu solución. Si quieres salir, puedes decir "salir del juego". ¿Qué deseas hacer?';
        repromptOutput = '¿Quieres intentar responder o salir del juego?';
        } else if (sessionAttributes.estado === 'completado') {
        speakOutput = 'Has terminado todos los desafíos. Si quieres volver a jugar, di "iniciar juego". ¿Qué quieres hacer?';
        repromptOutput = '¿Quieres iniciar un nuevo juego?';
        } else {
        speakOutput = 'Puedes decir "iniciar juego" para comenzar la aventura o "salir del juego" para abandonar.';
        repromptOutput = '¿Quieres iniciar el juego?';
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptOutput)
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        IniciarJuegoIntentHandler,
        ResolverPuzzleIntentHandler,
        CancelAndStopIntentHandler,
        HelpIntentHandler,
        FallbackIntentHandler
    )
    .lambda();
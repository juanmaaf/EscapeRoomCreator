const Alexa = require('ask-sdk-core');
const fs = require('fs');
const path = require('path');

function tienePantalla(handlerInput) {
    return !!Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)['Alexa.Presentation.HTML'];
}

let juegos = [];
try {
    const data = fs.readFileSync(path.resolve(__dirname, 'juegos.json'), 'utf8');
    juegos = JSON.parse(data);
    console.log(`Cargados ${juegos.length} juegos desde juegos.json`);
} catch (error) {
    console.error('Error leyendo juegos.json:', error);
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = '¡Bienvenido a <lang xml:lang="en-US">Escape Room Creator</lang>! Puedes decir: "cargar juego número..." para cargar un juego. También puedes decir "salir del juego" para abandonar.';

        if (tienePantalla(handlerInput)) {
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt('¿Qué quieres hacer? Puedes decir "cargar juego número..." para cargar un juego.')
                .addDirective({
                    type: "Alexa.Presentation.HTML.Start",
                    data: {},
                    request: {
                        uri: "https://d1qeen6fmshz39.cloudfront.net/entrega3/index.html",
                        method: "GET",
                    },
                    configuration: {
                        timeoutInSeconds: 300
                    }
                })
                .getResponse();
        } else {
            return handlerInput.responseBuilder
                .speak('Esta experiencia solo está disponible en dispositivos con pantalla como Echo Show.')
                .withShouldEndSession(true)
                .getResponse();
        }
    }
};

const IntentSinJuegoHandler = {
  canHandle(handlerInput) {
      const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      const tieneJuegoCargado = !!sessionAttributes.juego;
      const puzleEmpezado = sessionAttributes.puzleIniciado === true;

      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
          (
              (intentName === 'AMAZON.YesIntent' && !tieneJuegoCargado) ||
              (intentName === 'ResolverPuzle' && (!tieneJuegoCargado || !puzleEmpezado))
          );
  },
  handle(handlerInput) {
      const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
      let speakOutput = '';

      if (intentName === 'AMAZON.YesIntent') {
          speakOutput = `No hay ningún juego cargado actualmente. Puedes decir "cargar juego número..." para empezar un juego.`;
      } else if (intentName === 'ResolverPuzle') {
          speakOutput = `No hay ningún desafío iniciado. Primero debes iniciar un puzle antes de intentar resolverlo.`;
      }

      return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt('Puedes decir "cargar juego número..." para iniciar un juego.')
          .getResponse();
  }
};

const CargarEscapeRoomIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CargarEscapeRoom';
    },
    handle(handlerInput) {
      const idJuego = Alexa.getSlotValue(handlerInput.requestEnvelope, 'idJuego');
      const juego = juegos.find(j => j.id === Number(idJuego));

      if (!juego) {
        return handlerInput.responseBuilder
          .speak(`No encontré ningún juego con el número ${idJuego}. Inténtalo otra vez.`)
          .reprompt('Por favor, dime el número del juego que quieres cargar.')
          .getResponse();
      }

      const speakOutput = `<speak>
        Cargando juego número ${idJuego}.<break time="3s"/>
        ${juego.narrativa}
      </speak>`;

      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.juego = juego;
      sessionAttributes.puzleActual = 0;
      sessionAttributes.puzleIniciado = false;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('¿Quieres empezar los desafíos? Dí Sí para continuar')
        .getResponse();
    }
};

const YesIntentHandler = {
    canHandle(handlerInput) {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      const tieneJuegoCargado = !!sessionAttributes.juego;
      const puzleIniciado = sessionAttributes.puzleIniciado === true;
  
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent'
        && tieneJuegoCargado;
    },
    handle(handlerInput) {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      const puzleIniciado = sessionAttributes.puzleIniciado === true;
  
      if (puzleIniciado) {
        const speakOutput = 'Ya tienes un desafío en curso. Dime tu respuesta';
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt('¿Cuál es tu respuesta?')
          .getResponse();
      }
      
      const puzleActual = sessionAttributes.puzleActual || 0;
      const puzle = sessionAttributes.juego.puzles[puzleActual];
  
      sessionAttributes.puzleIniciado = true;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  
      const speakOutput = `Aquí está tu desafío actual: ${puzle.instruccion}`;
  
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('¿Cuál es tu respuesta?')
        .addDirective({
          type: 'Alexa.Presentation.HTML.HandleMessage',
          message: {
            action: "mostrar_puzle",
            datos: puzle.datos,
            tipo: puzle.tipo,
            instruccion: puzle.instruccion,
            tiempoMaximo: puzle.tiempoEstimadoSegundos
          }
        })
        .getResponse();
    }
};

const ResolverPuzleIntentHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const juegoCargado = !!sessionAttributes.juego;
        const puzleEmpezado = sessionAttributes.puzleIniciado === true;

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ResolverPuzle'
            && juegoCargado
            && puzleEmpezado;
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const puzleActualIndex = sessionAttributes.puzleActual;
        const puzle = sessionAttributes.juego.puzles[puzleActualIndex];

        sessionAttributes.fallosPuzle = sessionAttributes.fallosPuzle || 0;

        const respuestaUsuario = (handlerInput.requestEnvelope.request.intent.slots.respuestaUsuario.value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const respuestasCorrectas = puzle.respuestaCorrecta.map(r =>
            r.toLowerCase()
             .normalize('NFD')
             .replace(/[\u0300-\u036f]/g, '')
        );

        let speakOutput = '';
        let addDirective = null;

        if (respuestasCorrectas.includes(respuestaUsuario)) {
            sessionAttributes.puzleActual = puzleActualIndex + 1;
            sessionAttributes.puzleIniciado = false;
            sessionAttributes.fallosPuzle = 0;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            if (sessionAttributes.puzleActual >= sessionAttributes.juego.puzles.length) {
                sessionAttributes.juego = null;
                sessionAttributes.puzleActual = null;
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

                return handlerInput.responseBuilder
                    .speak('¡Correcto! Has completado todos los desafíos. ¡Felicidades, has terminado el juego!')
                    .withShouldEndSession(true)
                    .getResponse();
            } else {
                speakOutput = '¡Correcto! ¿Quieres continuar con el siguiente desafío? Di "sí" para continuar.';
            }
        } else {
            sessionAttributes.fallosPuzle += 1;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            if (sessionAttributes.fallosPuzle === 1) {
                speakOutput = 'Prueba otra vez.';
            } else if (sessionAttributes.fallosPuzle === 2) {
                speakOutput = `No es correcto. Aquí tienes una pista: ${puzle.pistas[0]}`;
                if (tienePantalla(handlerInput)) {
                    addDirective = {
                        type: 'Alexa.Presentation.HTML.HandleMessage',
                        message: {
                            action: 'mostrar_pista',
                            pista: puzle.pistas[0]
                        }
                    };
                }
            } else if (sessionAttributes.fallosPuzle >= 3) {
                speakOutput = `No es correcto. Con 3 fallos pasamos al siguiente desafío con penalización ¿Quieres continuar?.`;
                sessionAttributes.puzleActual = puzleActualIndex + 1;
                sessionAttributes.puzleIniciado = false;
                sessionAttributes.fallosPuzle = 0;
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            }
        }

        const responseBuilder = handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(puzle.instruccion);

        if (addDirective) {
            responseBuilder.addDirective(addDirective);
        }

        return responseBuilder.getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'No he entendido eso. Por favor, usa la pantalla para interactuar con el juego.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(false)
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
        const speakOutput = 'Para jugar, utiliza la pantalla para interactuar con el juego. Si quieres salir, di "salir del juego".';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('¿Qué quieres hacer?')
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        CargarEscapeRoomIntentHandler,
        YesIntentHandler,
        IntentSinJuegoHandler,
        ResolverPuzleIntentHandler,
        CancelAndStopIntentHandler,
        HelpIntentHandler,
        FallbackIntentHandler
    )
    .lambda();
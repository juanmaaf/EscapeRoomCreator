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
        const speakOutput = '¡Bienvenido a <lang xml:lang="en-US">Escape Room Creator</lang>! Puedes decir: "iniciar juego" para comenzar la narrativa. También puedes decir "salir del juego" para abandonar.';

        if (tienePantalla(handlerInput)) {
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt('¿Qué quieres hacer? Puedes decir "iniciar juego" para comenzar.')
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

      const speakOutput = `<speak>${juego.narrativa}</speak>`;

      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.juego = juego;
      if (sessionAttributes.puzzleActual === undefined || sessionAttributes.puzzleActual === null) {
        sessionAttributes.puzzleActual = 0;
      }
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('¿Quieres empezar los desafíos?')
        .getResponse();
    }
};

const IniciarPuzleActualIntentHandler = {
    canHandle(handlerInput) {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      const tieneJuegoCargado = !!sessionAttributes.juego;
  
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'IniciarPuzleActual'
        && tieneJuegoCargado;
    },
    handle(handlerInput) {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      const puzzleActual = sessionAttributes.puzzleActual || 0;
      const puzzle = sessionAttributes.juego.puzles[puzzleActual];
  
      const speakOutput = `Aquí está tu desafío actual: ${puzzle.instruccion}`;
  
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('¿Cuál es tu respuesta?')
        .addDirective({
          type: 'Alexa.Presentation.HTML.HandleMessage',
          message: {
            datos: puzzle.datos
          }
        })
        .getResponse();
    }
  };

const ResolverPuzzleIntentHandler = {
    canHandle(handlerInput) {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      const juegoCargado = !!sessionAttributes.juego;
      const puzzleEmpezado = sessionAttributes.puzzleActual !== undefined && sessionAttributes.puzzleActual !== null;
  
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ResolverPuzzle'
        && juegoCargado
        && puzzleEmpezado;
    },
    handle(handlerInput) {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      const puzzleActualIndex = sessionAttributes.puzzleActual;
      const puzzle = sessionAttributes.juego.puzles[puzzleActualIndex];
      const respuestaUsuario = (handlerInput.requestEnvelope.request.intent.slots.respuestaUsuario.value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
  
      const respuestasCorrectas = puzzle.respuestaCorrecta.map(r =>
        r.toLowerCase()
         .normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '')
      );
  
      if (respuestasCorrectas.includes(respuestaUsuario)) {
        sessionAttributes.puzzleActual = puzzleActualIndex + 1;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  
        if (sessionAttributes.puzzleActual >= sessionAttributes.juego.puzles.length) {
          sessionAttributes.juego = null;
          sessionAttributes.puzzleActual = null;
          handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  
          return handlerInput.responseBuilder
            .speak('¡Correcto! Has completado todos los desafíos. ¡Felicidades, has terminado el juego!')
            .withShouldEndSession(true)
            .getResponse();
        } else {
          return handlerInput.responseBuilder
            .speak('¡Correcto! ¿Quieres continuar con el siguiente desafío? Di "sí" para continuar.')
            .reprompt('Di "sí" para continuar con el siguiente desafío.')
            .getResponse();
        }
      } else {
        return handlerInput.responseBuilder
          .speak('No es la respuesta correcta. Inténtalo de nuevo.')
          .reprompt(puzzle.instruccion)
          .getResponse();
      }
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
        IniciarPuzleActualIntentHandler,
        ResolverPuzzleIntentHandler,
        CancelAndStopIntentHandler,
        HelpIntentHandler,
        FallbackIntentHandler
    )
    .lambda();
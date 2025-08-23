const Alexa = require('ask-sdk-core');
const fs = require('fs');
const path = require('path');

/* ===================== HELPERS ===================== */

// Avanza al siguiente puzle y deja el estado listo para pedir "sí" del usuario.
function avanzarPuzle(sessionAttributes) {
  sessionAttributes.puzleActual += 1;
  sessionAttributes.puzleIniciado = false;
  sessionAttributes.puzleTiempoActivo = false;
  sessionAttributes.fallosPuzle = 0;
}

// ¿Ya terminó el juego?
function juegoTerminado(sessionAttributes) {
  const juego = sessionAttributes.juego;
  return !juego || sessionAttributes.puzleActual >= juego.puzles.length;
}

// Finaliza juego con mensaje estándar
function finalizarJuego(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  sessionAttributes.juego = null;
  sessionAttributes.puzleActual = null;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

  return handlerInput.responseBuilder
    .speak('¡Has completado todos los desafíos! ¡Felicidades, has terminado el juego!')
    .withShouldEndSession(true)
    .getResponse();
}

// Normaliza string (minúsculas, sin acentos)
function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Obtiene el puzle actual (o null si no hay)
function getPuzleActual(sessionAttributes) {
  const juego = sessionAttributes.juego;
  const idx = sessionAttributes.puzleActual || 0;
  if (!juego || !juego.puzles || idx >= juego.puzles.length) return null;
  return juego.puzles[idx];
}

// Comprueba si el dispositivo tiene pantalla HTML
function tienePantalla(handlerInput) {
  return !!Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)['Alexa.Presentation.HTML'];
}

// Inicia (muestra) el puzle actual: marca flags y envía la directiva a HTML
function iniciarPuzleActual(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  const puzle = getPuzleActual(sessionAttributes);

  if (!puzle) {
    return finalizarJuego(handlerInput);
  }

  sessionAttributes.puzleIniciado = true;
  sessionAttributes.puzleTiempoActivo = true; // clave para permitir ResolverPuzle
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

  const response = handlerInput.responseBuilder
    .speak(`Aquí está tu desafío: ${puzle.instruccion}`)
    .reprompt('¿Cuál es tu respuesta?');

  if (tienePantalla(handlerInput)) {
    response.addDirective({
      type: 'Alexa.Presentation.HTML.HandleMessage',
      message: {
        action: "mostrar_puzle",
        datos: puzle.datos,
        tipo: puzle.tipo,
        instruccion: puzle.instruccion,
        tiempoMaximo: puzle.tiempoEstimadoSegundos
      }
    });
  }

  return response.getResponse();
}

// Cuando termina un puzle (correcto/tiempo/skip), dejamos preparado para “sí”
function pedirContinuar(handlerInput, texto) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  // En este punto ya hemos hecho avanzarPuzle() o marcado el fin
  if (juegoTerminado(sessionAttributes)) {
    return finalizarJuego(handlerInput);
  }
  return handlerInput.responseBuilder
    .speak(`${texto} ¿Quieres continuar con el siguiente desafío? Di "sí" para continuar.`)
    .reprompt('¿Quieres continuar?')
    .getResponse();
}

/* ===================== CARGA JUEGOS ===================== */

let juegos = [];
try {
  const data = fs.readFileSync(path.resolve(__dirname, 'juegos.json'), 'utf8');
  juegos = JSON.parse(data);
  console.log(`Cargados ${juegos.length} juegos desde juegos.json`);
} catch (error) {
  console.error('Error leyendo juegos.json:', error);
}

/* ===================== HANDLERS ===================== */

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
          configuration: { timeoutInSeconds: 300 }
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
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;

    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const tieneJuegoCargado = !!sessionAttributes.juego;
    const puzleEmpezado = sessionAttributes.puzleIniciado === true;

    return (intentName === 'AMAZON.YesIntent' && !tieneJuegoCargado) ||
           (intentName === 'ResolverPuzle' && (!tieneJuegoCargado || !puzleEmpezado));
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speakOutput = (intentName === 'AMAZON.YesIntent')
      ? 'No hay ningún juego cargado actualmente. Puedes decir "cargar juego número..." para empezar un juego.'
      : 'No hay ningún desafío iniciado. Primero debes iniciar un puzle antes de intentar resolverlo.';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('Puedes decir "cargar juego número..." para iniciar un juego.')
      .getResponse();
  }
};

const CargarEscapeRoomIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    return Alexa.getIntentName(handlerInput.requestEnvelope) === 'CargarEscapeRoom';
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

    const speakOutput = `<speak>Cargando juego número ${idJuego}.<break time="3s"/>${juego.narrativa}</speak>`;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.juego = juego;
    sessionAttributes.puzleActual = 0;
    sessionAttributes.puzleIniciado = false;
    sessionAttributes.puzleTiempoActivo = false;
    sessionAttributes.fallosPuzle = 0;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('¿Quieres empezar los desafíos? Di "sí" para continuar')
      .getResponse();
  }
};

const YesIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    if (Alexa.getIntentName(handlerInput.requestEnvelope) !== 'AMAZON.YesIntent') return false;

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    return !!sessionAttributes.juego;
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const puzleIniciado = sessionAttributes.puzleIniciado === true;

    if (puzleIniciado) {
      return handlerInput.responseBuilder
        .speak('Ya tienes un desafío en curso. Dime tu respuesta')
        .reprompt('¿Cuál es tu respuesta?')
        .getResponse();
    }

    if (juegoTerminado(sessionAttributes)) return finalizarJuego(handlerInput);

    return iniciarPuzleActual(handlerInput);
  }
};

const ResolverPuzleIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    if (Alexa.getIntentName(handlerInput.requestEnvelope) !== 'ResolverPuzle') return false;

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    return !!sessionAttributes.juego && sessionAttributes.puzleIniciado && sessionAttributes.puzleTiempoActivo;
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const puzle = getPuzleActual(sessionAttributes);
    if (!puzle) return finalizarJuego(handlerInput);

    sessionAttributes.fallosPuzle = sessionAttributes.fallosPuzle || 0;
    const slotValor = Alexa.getSlotValue(handlerInput.requestEnvelope, 'respuestaUsuario') || '';
    const respuestaUsuario = normalizar(slotValor);
    const respuestasCorrectas = (puzle.respuestaCorrecta || []).map(normalizar);

    let speakOutput = '';
    let addDirective = null;

    if (respuestasCorrectas.includes(respuestaUsuario)) {
      avanzarPuzle(sessionAttributes);
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return pedirContinuar(handlerInput, '¡Correcto!');
    } else {
      sessionAttributes.fallosPuzle += 1;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      const maxFallos = sessionAttributes.juego.fallosMaximosPuzle;
      const numPistas = (puzle.pistas || []).length;
      const falloActual = sessionAttributes.fallosPuzle;

      if (falloActual <= numPistas) {
        speakOutput = `No es correcto. ${puzle.pistas[falloActual - 1]}`;
        if (tienePantalla(handlerInput)) {
          addDirective = {
            type: 'Alexa.Presentation.HTML.HandleMessage',
            message: { action: 'mostrar_pista', pista: puzle.pistas[falloActual - 1] }
          };
        }
      } else if (falloActual < maxFallos) {
        speakOutput = 'Prueba otra vez.';
      } else {
        avanzarPuzle(sessionAttributes);
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return pedirContinuar(handlerInput, 'Has alcanzado el máximo de intentos de este desafío. Pasamos al siguiente.');
      }
    }

    const responseBuilder = handlerInput.responseBuilder.speak(speakOutput).reprompt('¿Cuál es tu respuesta?');
    if (addDirective) responseBuilder.addDirective(addDirective);
    return responseBuilder.getResponse();
  }
};

const ProcessHTMLMessageHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.HTML.Message";
  },
  handle(handlerInput) {
    const request = Alexa.getRequest(handlerInput.requestEnvelope);
    const message = request.message;

    console.log("Evento HTML recibido:", JSON.stringify(handlerInput.requestEnvelope, null, 2));

    if (message.action === "log_debug") console.log("[FRONTEND DEBUG]", message.message);
    if (message.action === "tiempo_acabado") {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.puzleIniciado = false;
      sessionAttributes.puzleTiempoActivo = false;
      sessionAttributes.fallosPuzle = 0;
      avanzarPuzle(sessionAttributes);
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return pedirContinuar(handlerInput, '¡Se acabó el tiempo!');
    }

    return handlerInput.responseBuilder.getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    return Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('No he entendido eso. Por favor, usa la pantalla para interactuar con el juego.')
      .withShouldEndSession(false)
      .getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    return intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Adiós, espero que vuelvas a intentarlo pronto.')
      .withShouldEndSession(true)
      .getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    return Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Para jugar, utiliza la pantalla para interactuar con el juego. Si quieres salir, di "salir del juego".')
      .reprompt('¿Qué quieres hacer?')
      .getResponse();
  }
};

// NUEVO: manejar cierre de sesión
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log("Session ended:", handlerInput.requestEnvelope.request.reason);
    return handlerInput.responseBuilder.getResponse();
  }
};

/* ===================== EXPORT ===================== */

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    CargarEscapeRoomIntentHandler,
    YesIntentHandler,
    IntentSinJuegoHandler,
    ResolverPuzleIntentHandler,
    ProcessHTMLMessageHandler,
    CancelAndStopIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .lambda();
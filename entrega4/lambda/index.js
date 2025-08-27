const Alexa = require('ask-sdk-core');
const db = require('./bd.js');

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

// Cifrado César
function cifradoCesar(texto, clave) {
  let resultado = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c >= 'A' && c <= 'Z') {
      resultado += String.fromCharCode((c.charCodeAt(0) - 65 + clave) % 26 + 65);
    } else if (c >= 'a' && c <= 'z') {
      resultado += String.fromCharCode((c.charCodeAt(0) - 97 + clave) % 26 + 97);
    } else {
      resultado += c;
    }
  }
  return resultado;
}

/* ===================== FUNCIONES PRINCIPALES ===================== */

function iniciarPuzleActual(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  const puzle = getPuzleActual(sessionAttributes);

  if (!puzle) return finalizarJuego(handlerInput);

  sessionAttributes.puzleIniciado = true;
  sessionAttributes.puzleTiempoActivo = true;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

  const respuesta = puzle.respuestaCorrecta || '';
  let mensajeCifrado = respuesta;

  if (puzle.tipo === "cifrado-cesar") {
    const clave = Number(puzle.claveCifrado) || 0;
    mensajeCifrado = cifradoCesar(respuesta, clave);
  }

  const response = handlerInput.responseBuilder
    .speak(`Aquí está tu desafío: ${puzle.instruccion}`)
    .reprompt('¿Cuál es tu respuesta?');

  response.addDirective({
    type: 'Alexa.Presentation.HTML.HandleMessage',
    message: {
      action: "mostrar_puzle",
      datos: mensajeCifrado,
      tipo: puzle.tipo,
      instruccion: puzle.instruccion,
      tiempoMaximo: puzle.tiempoEstimadoSegundos
    }
  });

  return response.getResponse();
}

function pedirContinuar(handlerInput, texto) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  if (juegoTerminado(sessionAttributes)) return finalizarJuego(handlerInput);

  return handlerInput.responseBuilder
    .speak(`${texto} ¿Quieres continuar con el siguiente desafío? Di "sí" para continuar.`)
    .reprompt('¿Quieres continuar?')
    .getResponse();
}

/* ===================== HANDLERS ===================== */

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    if (tienePantalla(handlerInput)) {
      return handlerInput.responseBuilder
        .addDirective({
          type: "Alexa.Presentation.HTML.Start",
          data: {},
          request: {
            uri: "https://d1qeen6fmshz39.cloudfront.net/entrega4/index.html",
            method: "GET",
          },
          configuration: { timeoutInSeconds: 300 }
        })
        .speak('¡Bienvenido a <lang xml:lang="en-US">Escape Room Creator</lang>! Por favor, inicia sesión pulsando "Soy Alumno", "Soy Docente" o "Soy Coordinador" en la pantalla.')
        .withShouldEndSession(false)
        .getResponse();
    } else {
      return handlerInput.responseBuilder
        .speak('Esta experiencia solo está disponible en dispositivos con pantalla como Echo Show.')
        .withShouldEndSession(true)
        .getResponse();
    }
  }
};

const CrearNuevoJuegoIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'CrearNuevoJuego';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (!['docente', 'coordinador'].includes(sessionAttributes.tipoUsuario)) {
      return handlerInput.responseBuilder
        .speak('Solo los docentes y coordinadores registrados pueden crear nuevos juegos.')
        .getResponse();
    }

    return db.listarJuegos()
      .then(result => {
        if (result.success) {
          handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.HTML.HandleMessage',
            message: {
              action: 'abrir_editor_escape_room',
              datos: result.juegos || []
            }
          });
          return handlerInput.responseBuilder
            .speak('Abriendo el editor de <lang xml:lang="en-US">escape rooms</lang>. Usa la pantalla para crear tu juego.')
            .getResponse();
        } else {
          return handlerInput.responseBuilder
            .speak('No se pudo obtener la lista de juegos.')
            .getResponse();
        }
      })
      .catch(err => {
        console.error("Error al listar juegos:", err);
        return handlerInput.responseBuilder
          .speak("Ocurrió un error al intentar abrir el editor de juegos.")
          .getResponse();
      });
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
      ? 'No hay ningún juego cargado actualmente. Puedes decir "cargar juego..." y a continuación el título para empezar un juego.'
      : 'No hay ningún desafío iniciado. Primero debes iniciar un puzle antes de intentar resolverlo.';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('Puedes decir "cargar juego número..." para iniciar un juego.')
      .getResponse();
  }
};

const CargarEscapeRoomIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'CargarEscapeRoom';
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (!sessionAttributes.usuarioLogueado) {
      return handlerInput.responseBuilder
        .speak('Debes iniciar sesión antes de cargar un juego.')
        .reprompt('Por favor, inicia sesión pulsando "Soy Alumno", "Soy Docente" o "Soy Coordinador".')
        .getResponse();
    }

    const tituloJuego = (Alexa.getSlotValue(handlerInput.requestEnvelope, 'tituloJuego') || '').toLowerCase();
    return db.buscarJuegoPorTitulo(tituloJuego).then(result => {
      const juegosEncontrados = result.juegos || [];
      if (!juegosEncontrados.length) {
        return handlerInput.responseBuilder
          .speak(`No encontré ningún juego con el título "${tituloJuego}".`)
          .reprompt('Intenta decir el título del juego que quieres cargar.')
          .getResponse();
      }

      const juego = juegosEncontrados[0];
      sessionAttributes.juego = juego;
      sessionAttributes.puzleActual = 0;
      sessionAttributes.puzleIniciado = false;
      sessionAttributes.puzleTiempoActivo = false;
      sessionAttributes.fallosPuzle = 0;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      const speakOutput = `<speak>Cargando juego "${tituloJuego}".<break time="3s"/>${juego.narrativa}</speak>`;

      handlerInput.responseBuilder.addDirective({
        type: 'Alexa.Presentation.HTML.HandleMessage',
        message: { action: 'mostrar_portada', tipo: juego.tipo_portada }
      });

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('¿Quieres empezar los desafíos? Di "sí" para continuar')
        .getResponse();
    }).catch(err => {
      console.error('Error buscando juego por título:', err);
      return handlerInput.responseBuilder
        .speak('Hubo un error al cargar el juego. Intenta de nuevo más tarde.')
        .getResponse();
    });
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
      
        if (juegoTerminado(sessionAttributes)) {
          return handlerInput.responseBuilder
            .speak('Has alcanzado el máximo de intentos de este último desafío. El juego ha terminado.')
            .withShouldEndSession(true)
            .getResponse();
        } else {
          return pedirContinuar(handlerInput, 'Has alcanzado el máximo de intentos de este desafío. Pasamos al siguiente.');
        }
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

    console.log("[FRONTEND] Mensaje recibido:", JSON.stringify(message, null, 2));

    if (message.action === "log_debug") console.log("[FRONTEND DEBUG]", message.message);
    if (message.action === "tiempo_acabado") {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.puzleIniciado = false;
      sessionAttributes.puzleTiempoActivo = false;
      sessionAttributes.fallosPuzle = 0;
      avanzarPuzle(sessionAttributes);
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    
      if (juegoTerminado(sessionAttributes)) {
        return handlerInput.responseBuilder
          .speak('¡Se acabó el tiempo en el último desafío! El juego ha terminado.')
          .withShouldEndSession(true)
          .getResponse();
      } else {
        return pedirContinuar(handlerInput, '¡Se acabó el tiempo!');
      }
    }

    // ===================== LOGIN / REGISTRO =====================
    if (message.action === "login_docente" || message.action === "login_coordinador") {
      const { usuario, password } = message.datos;
      const tipo = message.action === "login_docente" ? "docente" : "coordinador";
    
      return db.loginDocenteCoordinador(usuario, password, tipo)
        .then(result => {
          if (result.success) {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            sessionAttributes.usuarioLogueado = usuario;
            sessionAttributes.tipoUsuario = tipo;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    
            let speakOutput = "";
            if (tipo === "docente") {
              speakOutput = `¡Bienvenido, ${result.nombre}! Has iniciado sesión correctamente. ` +
                            `Puedes decir: "cargar juego..." y a continuación su título para cargar un juego o ` +
                            `"crear nuevo juego" para crear uno nuevo.`;
            } else {
              speakOutput = `¡Bienvenido, ${result.nombre}! Has iniciado sesión correctamente. ` +
                            `Puedes decir: "cargar juego..." y a continuación su título para cargar un juego o ` +
                            `"crear nuevo juego" para crear uno nuevo o ` + 
                            `"generar reportes" para generar un nuevo reporte.`;
            }
    
            handlerInput.responseBuilder.addDirective({
              type: 'Alexa.Presentation.HTML.HandleMessage',
              message: { action: "login_exitoso", tipoUsuario: tipo }
            });
    
            return handlerInput.responseBuilder.speak(speakOutput).getResponse();
          } else {
            return handlerInput.responseBuilder
              .speak(`Error: ${result.message}`)
              .getResponse();
          }
        })
        .catch(err => {
          console.error(err);
          return handlerInput.responseBuilder
            .speak("Ocurrió un error al intentar iniciar sesión. Inténtalo de nuevo.")
            .getResponse();
        });
    }
    
    if (message.action === "registrar_docente" || message.action === "registrar_coordinador") {
      const { nombre, usuario, password } = message.datos;
      const tipo = message.action === "registrar_docente" ? "docente" : "coordinador";
    
      return db.registrarDocenteCoordinador({ nombre, usuario, password, tipo })
        .then(result => {
          if (result.success) {
            return handlerInput.responseBuilder
              .speak(`${tipo.charAt(0).toUpperCase() + tipo.slice(1)} ${nombre} registrado correctamente. Ya puedes iniciar sesión.`)
              .getResponse();
          } else {
            return handlerInput.responseBuilder
              .speak(`Error al registrar: ${result.message}`)
              .getResponse();
          }
        })
        .catch(err => {
          console.error(err);
          return handlerInput.responseBuilder
            .speak("Ocurrió un error al registrar el usuario. Inténtalo nuevamente.")
            .getResponse();
        });
    }

    if (message.action === "login_alumno") {
      const { nombre, curso, grupo } = message.datos;
      return db.loginAlumno(nombre, curso, grupo)
        .then(result => {
          if (result.success) {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            sessionAttributes.usuarioLogueado = nombre;
            sessionAttributes.tipoUsuario = 'alumno';
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            const speakOutput = `¡Bienvenido, ${result.nombre}! Has ingresado correctamente. ` +
              `Puedes decir: "cargar juego..." y a continuación su título para cargar un juego o `;

            handlerInput.responseBuilder.addDirective({
              type: 'Alexa.Presentation.HTML.HandleMessage',
              message: { 
                action: "login_exitoso", 
                tipoUsuario: "alumno" 
              }
            }); 

            return handlerInput.responseBuilder
              .speak(speakOutput)
              .getResponse();
          } else {
            return handlerInput.responseBuilder
              .speak("Ocurrió un error al iniciar sesión como alumno. Inténtalo de nuevo.")
              .getResponse();
          }
        })
        .catch(err => {
          console.error(err);
          return handlerInput.responseBuilder
            .speak("Ocurrió un error inesperado. Inténtalo de nuevo.")
            .getResponse();
        });
    }
    // ===================== GUARDAR NUEVO ESCAPE ROOM =====================
    if (message.action === "guardar_nuevo_escape_room") {
      const juego = message.datos;
      return db.guardarJuego(juego)
        .then(result => {
          if (result.success) {
            // Enviar mensaje al frontend indicando que se guardó correctamente
            handlerInput.responseBuilder.addDirective({
              type: 'Alexa.Presentation.HTML.HandleMessage',
              message: { 
                action: "guardado_juego_exitoso"
              }
            }); 
            return handlerInput.responseBuilder
              .speak(`El juego ${result.juego.titulo} se ha guardado correctamente.`)
              .getResponse();
          } else {
            return handlerInput.responseBuilder
              .speak("No se pudo guardar el juego.")
              .getResponse();
          }
        })
        .catch(err => {
          console.error("Error al guardar juego:", err);
          return handlerInput.responseBuilder
            .speak("Ocurrió un error al guardar el juego.")
            .getResponse();
        });
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
      .speak('No he entendido eso. Por favor, inténtalo de nuevo.')
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
      .speak('Para jugar, utiliza la pantalla y los comandos de voz para interactuar con el juego. Si quieres salir, di "salir del juego".')
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
    CrearNuevoJuegoIntentHandler,
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
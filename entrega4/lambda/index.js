const Alexa = require('ask-sdk-core');
const db = require('./bd.js');

/* ===================== HELPERS ===================== */

// Obtener sesión actual desde BD
function obtenerSesionActual(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  const { userID, sesionID } = sessionAttributes;

  if (!userID || !sesionID) {
    return Promise.resolve(null);
  }

  return db.obtenerSesion(userID, sesionID)
    .then(item => item)
    .catch(err => {
      console.error("Error obteniendo la sesión actual:", err);
      return null;
    });
}

// Avanza al siguiente puzle y deja el estado listo para pedir "sí" del usuario.
function avanzarPuzle(sesion) {
  sesion.puzleActual = (sesion.puzleActual || 0) + 1;
  sesion.puzleIniciado = false;
  sesion.puzleTiempoActivo = false;
  sesion.fallosPuzle = 0;
}

// ¿Ya terminó el juego?
function juegoTerminado(sesion) {
  const juego = sesion.juego;
  return !juego || (sesion.puzleActual >= (juego.puzles ? juego.puzles.length : 0));
}

// Finaliza juego con mensaje estándar
function finalizarJuego(handlerInput, sesion) {
  return db.actualizarSesion(sesion.userID, sesion.sesionID, {
    juegoID: null,
    puzleActual: null,
    puzleIniciado: false,
    puzleTiempoActivo: false,
    fallosPuzle: 0
  }).then(() => {
    return handlerInput.responseBuilder
      .speak('¡Has completado todos los desafíos! ¡Felicidades, has terminado el juego!')
      .withShouldEndSession(true)
      .getResponse();
  }).catch(err => {
    console.error("Error finalizando juego:", err);
    return handlerInput.responseBuilder
      .speak('Ocurrió un error al finalizar el juego. Intenta de nuevo.')
      .getResponse();
  });
}

// Normaliza string (minúsculas, sin acentos)
function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Obtiene el puzle actual (o null si no hay)
function getPuzleActual(sesion, juego) {
  const idx = sesion.puzleActual || 0;
  if (!juego || !juego.puzles || idx >= juego.puzles.length) return null;
  return juego.puzles[idx];
}

// Comprueba si el dispositivo tiene pantalla HTML
function tienePantalla(handlerInput) {
  return !!Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)['Alexa.Presentation.HTML'];
}

// Cifrado César
function cifradoCesar(texto, clave) {
  texto = (texto || '').toUpperCase();
  let resultado = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c >= 'A' && c <= 'Z') {
      resultado += String.fromCharCode((c.charCodeAt(0) - 65 + clave) % 26 + 65);
    } else {
      resultado += c;
    }
  }
  return resultado;
}

/* ===================== FUNCIONES PRINCIPALES ===================== */

function iniciarPuzleActual(handlerInput, sesion) {
  const juego = sesion.juego;
  const puzleActualIndex = sesion.puzleActual || 0;
  const puzle = juego && juego.puzles && juego.puzles[puzleActualIndex];

  if (!puzle) return finalizarJuego(handlerInput, sesion);

  // Actualizamos la sesión en BD
  sesion.puzleIniciado = true;
  sesion.puzleTiempoActivo = true;

  return db.actualizarSesion(sesion.userID, sesion.sesionID, {
    puzleIniciado: true,
    puzleTiempoActivo: true
  }).then(() => {
    // Enviamos la info del puzle al frontend
    const respuesta = (puzle.respuestaCorrecta || '').toUpperCase();
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
  }).catch(err => {
    console.error("Error iniciando puzle:", err);
    return handlerInput.responseBuilder
      .speak('Ocurrió un error al iniciar el desafío. Intenta de nuevo.')
      .getResponse();
  });
}

function pedirContinuar(handlerInput, sesion, texto) {
  if (juegoTerminado(sesion)) {
    return finalizarJuego(handlerInput, sesion);
  }

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
    return obtenerSesionActual(handlerInput).then(sesion => {
      if (!['docente', 'coordinador'].includes(sesion.tipoUsuario)) {
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
    }).catch(err => {
      console.error('Error obteniendo sesión en CrearNuevoJuegoIntentHandler:', err);
      return handlerInput.responseBuilder
        .speak('Ocurrió un error al verificar tu sesión. Intenta de nuevo.')
        .getResponse();
    });
  }
};
  
const IntentSinJuegoHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;

    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    return intentName === 'AMAZON.YesIntent' || intentName === 'ResolverPuzle';
  },
  handle(handlerInput) {
    return obtenerSesionActual(handlerInput).then(sesion => {
      const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);

      if (!sesion || !sesion.juegoID) {
        const speakOutput = (intentName === 'AMAZON.YesIntent')
          ? 'No hay ningún juego cargado actualmente. Puedes decir "cargar juego..." y a continuación el título para empezar un juego.'
          : 'No hay ningún desafío iniciado. Primero debes cargar un juego antes de intentar resolver un puzle.';
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt('Puedes decir "cargar juego número..." para iniciar un juego.')
          .getResponse();
      }

      if (intentName === 'ResolverPuzle' && (!sesion.puzleIniciado || !sesion.puzleTiempoActivo)) {
        return handlerInput.responseBuilder
          .speak('No hay un desafío en curso. Primero inicia un puzle diciendo "Sí" para comenzar.')
          .reprompt('Di "Sí" para iniciar el siguiente desafío.')
          .getResponse();
      }
      return false;
    }).catch(err => {
      console.error('Error en IntentSinJuegoHandler:', err);
      return handlerInput.responseBuilder
        .speak('Ocurrió un error al comprobar la sesión. Intenta de nuevo.')
        .getResponse();
    });
  }
};

const CargarEscapeRoomIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'CargarEscapeRoom';
  },
  handle(handlerInput) {
    // Obtener la sesión actual desde BD
    return obtenerSesionActual(handlerInput).then(sesion => {
      if (!sesion) {
        return handlerInput.responseBuilder
          .speak('Debes iniciar sesión antes de cargar un juego.')
          .reprompt('Por favor, inicia sesión diciendo "Soy Alumno", "Soy Docente" o "Soy Coordinador".')
          .getResponse();
      }

      const { userID, sesionID } = sesion;
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
        // Actualizar sesión en BD
        return db.actualizarSesion(userID, sesionID, {
          juegoID: juego.juegoID,
          puzleActual: 0,
          puzleIniciado: false,
          puzleTiempoActivo: false,
          fallosPuzle: 0
        }).then(() => {
          const speakOutput = `<speak>Cargando juego "${tituloJuego}".<break time="3s"/>${juego.narrativa}</speak>`;

          handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.HTML.HandleMessage',
            message: { action: 'mostrar_portada', tipo: juego.tipo_portada }
          });

          return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('¿Quieres empezar los desafíos? Di "sí" para continuar')
            .getResponse();
        });
      }).catch(err => {
        console.error('Error buscando juego o actualizando sesión:', err);
        return handlerInput.responseBuilder
          .speak('Hubo un error al cargar el juego. Intenta de nuevo más tarde.')
          .getResponse();
      });
    });
  }
};

const YesIntentHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== 'IntentRequest') return false;
    if (Alexa.getIntentName(handlerInput.requestEnvelope) !== 'AMAZON.YesIntent') return false;
  },
  handle(handlerInput) {
    return obtenerSesionActual(handlerInput).then(sesion => {
      if (sesion.puzleIniciado) {
        return handlerInput.responseBuilder
          .speak('Ya tienes un desafío en curso. Dime tu respuesta.')
          .reprompt('¿Cuál es tu respuesta?')
          .getResponse();
      }

      if (juegoTerminado(sesion)) {
        return finalizarJuego(handlerInput, sesion);
      }

      return iniciarPuzleActual(handlerInput, sesion);
    }).catch(err => {
      console.error("Error en YesIntentHandler:", err);
      return handlerInput.responseBuilder
        .speak('Ocurrió un error al iniciar el desafío. Intenta de nuevo.')
        .getResponse();
    });
  }
};

const ResolverPuzleIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'ResolverPuzle';
  },

  handle(handlerInput) {
    return obtenerSesionActual(handlerInput).then(sesion => {
      // Obtener el juego completo desde DB
      return buscarJuegoPorID(sesion.juegoID).then(resultadoJuego => {
        if (!resultadoJuego.success || !resultadoJuego.juego) {
          return handlerInput.responseBuilder
            .speak('El juego cargado no se encuentra disponible. Por favor, carga otro juego.')
            .reprompt('Carga un juego diciendo: "Cargar juego..." y el título del juego.')
            .getResponse();
        }

        const juego = resultadoJuego.juego;
        const puzle = getPuzleActual(sesion, juego);
        if (!puzle) {
          return finalizarJuego(handlerInput, sesion);
        }

        sesion.fallosPuzle = sesion.fallosPuzle || 0;

        const slotValor = Alexa.getSlotValue(handlerInput.requestEnvelope, 'respuestaUsuario') || '';
        const respuestaUsuario = normalizar(slotValor);
        const respuestaCorrecta = normalizar(puzle.respuestaCorrecta);

        const maxFallos = juego.fallosMaximosPuzle;
        const numPistas = Array.isArray(puzle.pistas) ? puzle.pistas.length : 0;
        let falloActual = sesion.fallosPuzle;

        let speakOutput = '';
        let addDirective = null;

        if (respuestaUsuario === respuestaCorrecta) {
          // Respuesta correcta: avanzar al siguiente puzle
          avanzarPuzle(sesion);

          return db.actualizarSesion(sesion.userID, sesion.sesionID, sesion)
            .then(() => pedirContinuar(handlerInput, sesion))
            .catch(err => {
              console.error('Error actualizando sesión:', err);
              return handlerInput.responseBuilder
                .speak('Ocurrió un error al actualizar el progreso. Intenta de nuevo.')
                .getResponse();
            });
        }

        // Respuesta incorrecta
        sesion.fallosPuzle += 1;
        falloActual = sesion.fallosPuzle;

        return db.actualizarSesion(sesion.userID, sesion.sesionID, sesion).then(() => {
          if (falloActual <= numPistas) {
            speakOutput = `No es correcto. ${puzle.pistas[falloActual - 1] || ''}`;
            if (tienePantalla(handlerInput)) {
              addDirective = {
                type: 'Alexa.Presentation.HTML.HandleMessage',
                message: { action: 'mostrar_pista', pista: puzle.pistas[falloActual - 1] || '' }
              };
            }
          } else if (falloActual < maxFallos) {
            speakOutput = 'No es correcto. Intenta nuevamente.';
          } else {
            // Alcanzó el máximo de fallos
            avanzarPuzle(sesion);

            return db.actualizarSesion(sesion.userID, sesion.sesionID, sesion).then(() => {
              if (juegoTerminado(sesion, juego)) {
                return handlerInput.responseBuilder
                  .speak('Has alcanzado el máximo de intentos de este último desafío. El juego ha terminado.')
                  .withShouldEndSession(true)
                  .getResponse();
              } else {
                return pedirContinuar(handlerInput, sesion, 'Has alcanzado el máximo de intentos de este desafío. Pasamos al siguiente.');
              }
            });
          }

          const responseBuilder = handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('¿Cuál es tu respuesta?');

          if (addDirective) responseBuilder.addDirective(addDirective);
          return responseBuilder.getResponse();
        }).catch(err => {
          console.error('Error actualizando sesión tras fallo:', err);
          return handlerInput.responseBuilder
            .speak('Ocurrió un error al procesar tu respuesta. Intenta de nuevo.')
            .getResponse();
        });

      }).catch(err => {
        console.error('Error obteniendo juego en ResolverPuzleIntentHandler:', err);
        return handlerInput.responseBuilder
          .speak('Ocurrió un error al procesar tu respuesta. Intenta de nuevo.')
          .getResponse();
      });
    }).catch(err => {
      console.error('Error obteniendo sesión en ResolverPuzleIntentHandler:', err);
      return handlerInput.responseBuilder
        .speak('Ocurrió un error al procesar tu respuesta. Intenta de nuevo.')
        .getResponse();
    });
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
      return obtenerSesionActual(handlerInput).then(sesion => {
        sesion.puzleIniciado = false;
        sesion.puzleTiempoActivo = false;
        sesion.fallosPuzle = 0;
    
        avanzarPuzle(sesion);
    
        return db.actualizarSesion(sesion.userID, sesion.sesionID, sesion).then(() => {
          if (juegoTerminado(sesion)) {
            return handlerInput.responseBuilder
              .speak('¡Se acabó el tiempo en el último desafío! El juego ha terminado.')
              .withShouldEndSession(true)
              .getResponse();
          } else {
            return pedirContinuar(handlerInput, sesion, '¡Se acabó el tiempo!');
          }
        }).catch(err => {
          console.error('Error actualizando sesión tras tiempo acabado:', err);
          return handlerInput.responseBuilder
            .speak('Ocurrió un error al procesar el fin del tiempo. Intenta de nuevo.')
            .getResponse();
        });
      }).catch(err => {
        console.error('Error obteniendo sesión tras tiempo acabado:', err);
        return handlerInput.responseBuilder
          .speak('Ocurrió un error al procesar el fin del tiempo. Intenta de nuevo.')
          .getResponse();
      });
    }

    // ===================== LOGIN / REGISTRO =====================
    if (message.action === "login_docente" || message.action === "login_coordinador") {
      const { usuario, password } = message.datos;
      const tipo = message.action === "login_docente" ? "docente" : "coordinador";
    
      return db.loginDocenteCoordinador(usuario, password, tipo)
        .then(result => {
          if (result.success) {
            // Crear sesión en BD incluyendo el tipo de usuario
            return db.crearSesion(result.userId, tipo, null)
              .then(sesion => {
                const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
                sessionAttributes.userID = sesion.item.userID;
                sessionAttributes.sesionID = sesion.item.sesionID;
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
                  message: { 
                    action: "login_exitoso", 
                    tipoUsuario: tipo
                  }
                });
    
                return handlerInput.responseBuilder.speak(speakOutput).getResponse();
              });
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
            // Crear sesión en BD incluyendo el tipo de usuario
            return db.crearSesion(result.userId, "alumno", null)
              .then(sesion => {
                const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
                sessionAttributes.userID = sesion.item.userID;
                sessionAttributes.sesionID = sesion.item.sesionID;
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    
                const speakOutput = `¡Bienvenido, ${result.nombre}! Has ingresado correctamente. ` +
                                    `Puedes decir: "cargar juego..." y a continuación su título para cargar un juego.`;
    
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
              });
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
const Alexa = require('ask-sdk-core');
const db = require('./bd.js');

/* ===================== HELPERS ===================== */

// Obtener sesión actual desde BD
async function obtenerSesionActual(handlerInput) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  const { userID, sesionID } = sessionAttributes;

  if (!userID || !sesionID) {
    return null;
  }

  try {
    const item = await db.obtenerSesion(userID, sesionID);
    return item;
  } catch (err) {
    console.error("Error obteniendo la sesión actual:", err);
    return null;
  }
}

// Avanza al siguiente puzle
function avanzarPuzle(sesion, completadoCorrectamente = true) {
  sesion.puzleActual = (sesion.puzleActual || 0) + 1;
  sesion.puzleIniciado = false;
  sesion.puzleTiempoActivo = false;
  sesion.fallosPuzle = 0;

  if (completadoCorrectamente) {
    sesion.puzlesSuperados = (sesion.puzlesSuperados || 0) + 1;
  }
}

// ¿Ya terminó el juego?
async function juegoTerminado(sesion) {
  try {
    const resultadoJuego = await db.buscarJuegoPorID(sesion.juegoID);
    const juego = resultadoJuego.juego;
    return !juego || (sesion.puzleActual >= (juego.puzles ? juego.puzles.length : 0));
  } catch (err) {
    console.error("Error verificando si el juego terminó:", err);
    return true; // si falla la consulta, mejor devolver que terminó
  }
}

// Finaliza juego con mensaje estándar
async function finalizarJuego(handlerInput, sesion) {
  try {
    // Registrar fecha de fin de juego
    const fechaFin = new Date().toISOString();
    sesion.fechaFinJuego = fechaFin;

    // Actualizar sesión con fecha de fin
    await db.actualizarSesion(sesion.userID, sesion.sesionID, { fechaFinJuego: fechaFin });

    //await db.eliminarSesion(sesion.userID, sesion.sesionID);

    return handlerInput.responseBuilder
      .speak('¡Has completado todos los desafíos! ¡Felicidades, has terminado el juego!')
      .withShouldEndSession(true)
      .getResponse();
  } catch (err) {
    console.error("Error finalizando juego:", err);
    return handlerInput.responseBuilder
      .speak('Ocurrió un error al finalizar el juego. Intenta de nuevo.')
      .getResponse();
  }
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

async function iniciarPuzleActual(handlerInput, sesion) {
  const puzleActualIndex = sesion.puzleActual || 0;

  try {
    // Obtener el juego completo desde BD
    const resultadoJuego = await db.buscarJuegoPorID(sesion.juegoID);
    if (!resultadoJuego.success || !resultadoJuego.juego) {
      return handlerInput.responseBuilder
        .speak('El juego cargado no se encuentra disponible. Por favor, carga otro juego.')
        .reprompt('Carga un juego diciendo: "Cargar juego..." y el título del juego.')
        .getResponse();
    }

    const juego = resultadoJuego.juego;
    const puzle = juego.puzles && juego.puzles[puzleActualIndex];
    if (!puzle) {
      return finalizarJuego(handlerInput, sesion);
    }

    // Actualizamos la sesión
    sesion.puzleIniciado = true;
    sesion.puzleTiempoActivo = true;
    sesion.fallosPuzle = 0;

    await db.actualizarSesion(sesion.userID, sesion.sesionID, {
      puzleIniciado: true,
      puzleTiempoActivo: true,
      fallosPuzle: 0
    });

    // Preparar el mensaje cifrado si aplica
    const respuesta = (puzle.respuestaCorrecta || '').toUpperCase();
    let mensajeCifrado = respuesta;

    if (puzle.tipo === "cifrado-cesar") {
      const clave = Number(puzle.claveCifrado) || 0;
      mensajeCifrado = cifradoCesar(respuesta, clave);
    }

    const responseBuilder = handlerInput.responseBuilder
      .speak(`Aquí está tu desafío: ${puzle.instruccion}`)
      .reprompt('¿Cuál es tu respuesta?');

    responseBuilder.addDirective({
      type: 'Alexa.Presentation.HTML.HandleMessage',
      message: {
        action: "mostrar_puzle",
        datos: mensajeCifrado,
        tipo: puzle.tipo,
        instruccion: puzle.instruccion,
        tiempoMaximo: puzle.tiempoEstimadoSegundos
      }
    });

    return responseBuilder.getResponse();

  } catch (err) {
    console.error("Error iniciando puzle:", err);
    return handlerInput.responseBuilder
      .speak('Ocurrió un error al iniciar el desafío. Intenta de nuevo.')
      .getResponse();
  }
}

async function pedirContinuar(handlerInput, sesion, texto) {
  try {
    const terminado = await juegoTerminado(sesion);
    if (terminado) {
      return finalizarJuego(handlerInput, sesion);
    }

    return handlerInput.responseBuilder
      .speak(`${texto} ¿Quieres continuar con el siguiente desafío? Di "sí" para continuar.`)
      .reprompt('¿Quieres continuar?')
      .getResponse();
  } catch (err) {
    console.error("Error en pedirContinuar:", err);
    return handlerInput.responseBuilder
      .speak('Ocurrió un error al verificar el estado del juego. Intenta de nuevo.')
      .getResponse();
  }
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
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "CrearNuevoJuego"
    );
  },
  async handle(handlerInput) {
    try {
      const sesion = await obtenerSesionActual(handlerInput);

      if (!sesion || !["docente", "coordinador"].includes(sesion.tipoUsuario)) {
        return handlerInput.responseBuilder
          .speak("Solo los docentes y coordinadores registrados pueden crear nuevos juegos.")
          .getResponse();
      }

      const result = await db.listarJuegos();

      if (result.success) {
        handlerInput.responseBuilder.addDirective({
          type: "Alexa.Presentation.HTML.HandleMessage",
          message: {
            action: "abrir_editor_escape_room",
            datos: result.juegos || [],
          },
        });

        return handlerInput.responseBuilder
          .speak(
            'Abriendo el editor de <lang xml:lang="en-US">escape rooms</lang>. Usa la pantalla para crear tu juego.'
          )
          .getResponse();
      } else {
        return handlerInput.responseBuilder
          .speak("No se pudo obtener la lista de juegos.")
          .getResponse();
      }
    } catch (err) {
      console.error("Error en CrearNuevoJuegoIntentHandler:", err);
      return handlerInput.responseBuilder
        .speak("Ocurrió un error al verificar tu sesión o abrir el editor. Intenta de nuevo.")
        .getResponse();
    }
  },
};

const CargarEscapeRoomIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "CargarEscapeRoom"
    );
  },
  async handle(handlerInput) {
    try {
      const sesion = await obtenerSesionActual(handlerInput);

      if (!sesion) {
        return handlerInput.responseBuilder
          .speak("Debes iniciar sesión antes de cargar un juego.")
          .reprompt(
            'Por favor, inicia sesión diciendo "Soy Alumno", "Soy Docente" o "Soy Coordinador".'
          )
          .getResponse();
      }

      const tituloJuego = (
        Alexa.getSlotValue(handlerInput.requestEnvelope, "tituloJuego") || ""
      ).toLowerCase();

      const result = await db.buscarJuegoPorTitulo(tituloJuego);
      const juegosEncontrados = result.juegos || [];

      if (!juegosEncontrados.length) {
        console.log('CargarEscapeRoomIntentHandler: No se encontró el juego con el título:', tituloJuego);
        console.log('Listado de juegos en DB:', result.juegos.map(j => j.titulo));
        return handlerInput.responseBuilder
          .speak(`No encontré ningún juego con el título "${tituloJuego}".`)
          .reprompt("Intenta decir el título del juego que quieres cargar.")
          .getResponse();
      }

      const juego = juegosEncontrados[0];

      await db.actualizarSesion(sesion.userID, sesion.sesionID, {
        juegoID: juego.juegoID,
        puzleActual: 0,
        puzleIniciado: false,
        puzleTiempoActivo: false,
        fallosPuzle: 0,
        fallosTotales: 0,
        puzlesSuperados: 0,
        fechaInicioJuego: new Date().toISOString(),
        fechaFinJuego: null
      });

      const speakOutput = `<speak>Cargando juego "${tituloJuego}".<break time="3s"/>${juego.narrativa}</speak>`;

      handlerInput.responseBuilder.addDirective({
        type: "Alexa.Presentation.HTML.HandleMessage",
        message: { action: "mostrar_portada", tipo: juego.tipo_portada },
      });

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('¿Quieres empezar los desafíos? Di "sí" para continuar')
        .getResponse();
    } catch (err) {
      console.error("Error en CargarEscapeRoomIntentHandler:", err);
      return handlerInput.responseBuilder
        .speak("Hubo un error al cargar el juego. Intenta de nuevo más tarde.")
        .getResponse();
    }
  },
};

const YesIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.YesIntent"
    );
  },
  async handle(handlerInput) {
    try {
      const sesion = await obtenerSesionActual(handlerInput);

      if (!sesion || !sesion.juegoID) {
        return handlerInput.responseBuilder
          .speak(
            'No hay ningún juego cargado actualmente. Puedes decir "cargar juego..." y a continuación el título para empezar un juego.'
          )
          .reprompt('Puedes decir "cargar juego número..." para iniciar un juego.')
          .getResponse();
      }

      if (sesion.puzleIniciado) {
        return handlerInput.responseBuilder
          .speak("Ya tienes un desafío en curso. Dime tu respuesta.")
          .reprompt("¿Cuál es tu respuesta?")
          .getResponse();
      }

      const terminado = await juegoTerminado(sesion);

      if (terminado) {
        return finalizarJuego(handlerInput, sesion);
      }

      return iniciarPuzleActual(handlerInput, sesion);
    } catch (err) {
      console.error("Error en YesIntentHandler:", err);
      return handlerInput.responseBuilder
        .speak("Ocurrió un error al iniciar el desafío. Intenta de nuevo.")
        .getResponse();
    }
  },
};

const ResolverPuzleIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           Alexa.getIntentName(handlerInput.requestEnvelope) === 'ResolverPuzle';
  },

  handle: async (handlerInput) => {
    try {
      const sesion = await obtenerSesionActual(handlerInput);

      if (!sesion || !sesion.juegoID) {
        return handlerInput.responseBuilder
          .speak('No hay ningún juego cargado actualmente. Puedes decir "cargar juego..." y a continuación el título para empezar un juego.')
          .reprompt('Puedes decir "cargar juego número..." para iniciar un juego.')
          .getResponse();
      }

      if (!sesion.puzleIniciado || !sesion.puzleTiempoActivo) {
        return handlerInput.responseBuilder
          .speak('No hay un desafío en curso. Primero inicia un puzle diciendo "Sí" para comenzar.')
          .reprompt('Di "Sí" para iniciar el siguiente desafío.')
          .getResponse();
      }

      const resultadoJuego = await db.buscarJuegoPorID(sesion.juegoID);

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

      if (respuestaUsuario === respuestaCorrecta) {
        const mensaje = `¡Respuesta correcta! ${puzle.narrativa} `;

        // Respuesta correcta
        avanzarPuzle(sesion, true);
        await db.actualizarSesion(sesion.userID, sesion.sesionID, {
          puzleActual: sesion.puzleActual,
          puzleIniciado: sesion.puzleIniciado,
          puzleTiempoActivo: sesion.puzleTiempoActivo,
          puzlesSuperados: sesion.puzlesSuperados
        });

        const terminado = await juegoTerminado(sesion);
        if (terminado) {
          return finalizarJuego(handlerInput, sesion);
        } else {
          return pedirContinuar(handlerInput, sesion, mensaje);
        }
      }

      // Respuesta incorrecta
      sesion.fallosPuzle += 1;
      sesion.fallosTotales = (sesion.fallosTotales || 0) + 1;
      await db.actualizarSesion(sesion.userID, sesion.sesionID, {
        fallosPuzle: sesion.fallosPuzle,
        fallosTotales: sesion.fallosTotales
      });

      let speakOutput = '';
      let addDirective = null;

      if (sesion.fallosPuzle <= numPistas) {
        speakOutput = `No es correcto. ${puzle.pistas[sesion.fallosPuzle - 1] || ''}`;
        if (tienePantalla(handlerInput)) {
          addDirective = {
            type: 'Alexa.Presentation.HTML.HandleMessage',
            message: { action: 'mostrar_pista', pista: puzle.pistas[sesion.fallosPuzle - 1] || '' }
          };
        }
      } else if (sesion.fallosPuzle < maxFallos) {
        speakOutput = 'No es correcto. Intenta nuevamente.';
      } else {
        // Alcanzó máximo de fallos
        avanzarPuzle(sesion, false);
        await db.actualizarSesion(sesion.userID, sesion.sesionID, {
          puzleActual: sesion.puzleActual,
          puzleIniciado: sesion.puzleIniciado,
          puzleTiempoActivo: sesion.puzleTiempoActivo,
          fallosPuzle: sesion.fallosPuzle
        });

        const terminado = await juegoTerminado(sesion);
        if (terminado) {
          // Registrar fecha de fin de juego
          const fechaFin = new Date().toISOString();
          sesion.fechaFinJuego = fechaFin;
          await db.actualizarSesion(sesion.userID, sesion.sesionID, { fechaFinJuego: fechaFin });

          return handlerInput.responseBuilder
            .speak('Has alcanzado el máximo de intentos de este último desafío. El juego ha terminado.')
            .withShouldEndSession(true)
            .getResponse();
        } else {
          return pedirContinuar(handlerInput, sesion, 'Has alcanzado el máximo de intentos de este desafío. Pasamos al siguiente.');
        }
      }

      const responseBuilder = handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('¿Cuál es tu respuesta?');

      if (addDirective) responseBuilder.addDirective(addDirective);

      return responseBuilder.getResponse();

    } catch (err) {
      console.error('Error en ResolverPuzleIntentHandler:', err);
      return handlerInput.responseBuilder
        .speak('Ocurrió un error al procesar tu respuesta. Intenta de nuevo.')
        .getResponse();
    }
  }
};

const ProcessHTMLMessageHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === "Alexa.Presentation.HTML.Message";
  },

  handle: async (handlerInput) => {
    const request = Alexa.getRequest(handlerInput.requestEnvelope);
    const message = request.message;

    try {
      console.log("[FRONTEND] Mensaje recibido:", JSON.stringify(message, null, 2));

      if (message.action === "log_debug") {
        console.log("[FRONTEND DEBUG]", message.message);
        return handlerInput.responseBuilder.getResponse();
      }

      // ===================== FIN DEL TIEMPO =====================
      if (message.action === "tiempo_acabado") {
        const sesion = await obtenerSesionActual(handlerInput);
    
        if (!sesion || !sesion.juegoID) {
          return handlerInput.responseBuilder
            .speak('No hay ningún juego cargado actualmente. Debes iniciar un juego antes de resolver desafíos.')
            .reprompt('Puedes decir "cargar juego número..." para iniciar un juego.')
            .getResponse();
        }
    
        // Resetear estado del puzle
        sesion.puzleIniciado = false;
        sesion.puzleTiempoActivo = false;
        sesion.fallosPuzle = 0;
    
        avanzarPuzle(sesion, false);
    
        await db.actualizarSesion(sesion.userID, sesion.sesionID, {
            puzleActual: sesion.puzleActual,
            puzleIniciado: sesion.puzleIniciado,
            puzleTiempoActivo: sesion.puzleTiempoActivo,
            fallosPuzle: sesion.fallosPuzle
        });
    
        const terminado = await juegoTerminado(sesion);
        if (terminado) {
          // Registrar fecha de fin de juego
          const fechaFin = new Date().toISOString();
          sesion.fechaFinJuego = fechaFin;
          await db.actualizarSesion(sesion.userID, sesion.sesionID, { fechaFinJuego: fechaFin });

          return handlerInput.responseBuilder
            .speak('¡Se acabó el tiempo en el último desafío! El juego ha terminado.')
            .withShouldEndSession(true)
            .getResponse();
        } else {
          return await pedirContinuar(handlerInput, sesion, '¡Se acabó el tiempo!');
        }
      }

      // ===================== LOGIN DOCENTE / COORDINADOR =====================
      if (["login_docente", "login_coordinador"].includes(message.action)) {
        const { usuario, password } = message.datos;
        const tipo = message.action === "login_docente" ? "docente" : "coordinador";

        const result = await db.loginDocenteCoordinador(usuario, password, tipo);
        if (!result.success) {
          return handlerInput.responseBuilder
            .speak(`Error: ${result.message}`)
            .getResponse();
        }

        const sesion = await db.crearSesion(result.userId, tipo, null);
        if (!sesion.success || !sesion.item) {
          console.error("Error creando sesión:", sesion);
          return handlerInput.responseBuilder
            .speak("Ocurrió un error al crear la sesión. Inténtalo de nuevo.")
            .getResponse();
        }

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
          message: { action: "login_exitoso", tipoUsuario: tipo }
        });

        return handlerInput.responseBuilder.speak(speakOutput).getResponse();
      }

      // ===================== REGISTRAR DOCENTE / COORDINADOR =====================
      if (["registrar_docente", "registrar_coordinador"].includes(message.action)) {
        const { nombre, usuario, password } = message.datos;
        const tipo = message.action === "registrar_docente" ? "docente" : "coordinador";

        const result = await db.registrarDocenteCoordinador({ nombre, usuario, password, tipo });
        if (result.success) {
          return handlerInput.responseBuilder
            .speak(`${tipo.charAt(0).toUpperCase() + tipo.slice(1)} ${nombre} registrado correctamente. Ya puedes iniciar sesión.`)
            .getResponse();
        } else {
          return handlerInput.responseBuilder
            .speak(`Error al registrar: ${result.message}`)
            .getResponse();
        }
      }

      // ===================== LOGIN ALUMNO =====================
      if (message.action === "login_alumno") {
        const { nombre, curso, grupo } = message.datos;

        const result = await db.loginAlumno(nombre, curso, grupo);
        if (!result.success) {
          return handlerInput.responseBuilder
            .speak("Ocurrió un error al iniciar sesión como alumno. Inténtalo de nuevo.")
            .getResponse();
        }

        const sesion = await db.crearSesion(result.userId, "alumno", null);
        if (!sesion.success || !sesion.item) {
          console.error("Error creando sesión de alumno:", sesion);
          return handlerInput.responseBuilder
            .speak("Ocurrió un error al crear la sesión. Inténtalo de nuevo.")
            .getResponse();
        }

        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.userID = sesion.item.userID;
        sessionAttributes.sesionID = sesion.item.sesionID;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        const speakOutput = `¡Bienvenido, ${result.nombre}! Has ingresado correctamente. ` +
                            `Puedes decir: "cargar juego..." y a continuación su título para cargar un juego.`;

        handlerInput.responseBuilder.addDirective({
          type: 'Alexa.Presentation.HTML.HandleMessage',
          message: { action: "login_exitoso", tipoUsuario: "alumno" }
        });

        return handlerInput.responseBuilder.speak(speakOutput).getResponse();
      }

      // ===================== GUARDAR NUEVO ESCAPE ROOM =====================
      if (message.action === "guardar_nuevo_escape_room") {
        const juego = message.datos;
        const result = await db.guardarJuego(juego);

        if (result.success) {
          handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.HTML.HandleMessage',
            message: { action: "guardado_juego_exitoso" }
          });

          return handlerInput.responseBuilder
            .speak(`El juego ${result.juego.titulo} se ha guardado correctamente.`)
            .getResponse();
        } else {
          return handlerInput.responseBuilder
            .speak("No se pudo guardar el juego.")
            .getResponse();
        }
      }

      // Default: responder con un OK si no hay acción reconocida
      return handlerInput.responseBuilder.getResponse();

    } catch (err) {
      console.error('Error en ProcessHTMLMessageHandler:', err);
      return handlerInput.responseBuilder
        .speak('Ocurrió un error al procesar la acción. Intenta de nuevo.')
        .getResponse();
    }
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
  handle: async (handlerInput) => {
    try {
      const sesion = await obtenerSesionActual(handlerInput);
      if (sesion && sesion.userID && sesion.sesionID) {
        await db.eliminarSesion(sesion.userID, sesion.sesionID);
        console.log(`Sesión eliminada: ${sesion.userID} / ${sesion.sesionID}`);
      }
    } catch (err) {
      console.error("Error al eliminar la sesión al salir de la skill:", err);
    }

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

// Cierre de sesión
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle: async (handlerInput) => {
    console.log("Session ended:", handlerInput.requestEnvelope.request.reason);

    try {
      const sesion = await obtenerSesionActual(handlerInput);
      if (sesion && sesion.userID && sesion.sesionID) {
        await db.eliminarSesion(sesion.userID, sesion.sesionID);
        console.log(`Sesión eliminada: ${sesion.userID} / ${sesion.sesionID}`);
      }
    } catch (err) {
      console.error("Error al eliminar la sesión al cerrar la skill:", err);
    }

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
    ResolverPuzleIntentHandler,
    ProcessHTMLMessageHandler,
    CancelAndStopIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .lambda();
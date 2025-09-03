let alexaClient;
let intervalContador = null;

/* ===================== CREACIÓN CLIENTE ALEXA ===================== */

Alexa.create({ version: '1.1' })
    .then(({ alexa }) => {
        alexaClient = alexa;
        alexaClient.skill.onMessage(handleMessageFromSkill);
    })
    .catch(error => {
        logToCloudwatch("Error al crear el cliente: " + error);
    });

/* ===================== HELPERS ===================== */

function logToCloudwatch(text) {
    handleMessageToSkill({ action: "log_debug", message: text });
}

// Mensaje de tiempo agotado
function tiempoAgotado() {
    handleMessageToSkill({ action: "tiempo_acabado" });
}

// Botones iniciales login
function mostrarMenuInicial() {
    document.getElementById("menu-inicial").innerHTML = `
        <button onclick="mostrarFormularioAlumno()">Soy Alumno</button>
        <button onclick="mostrarFormularioDocente()">Soy Docente</button>
        <button onclick="mostrarFormularioCoordinador()">Soy Coordinador</button>
    `;
}

function mostrarEditorEscapeRoom(juegosExistentes = []) {
  const container = document.getElementById("iframe-container");
  container.innerHTML = `
    <div id="editor-escape-room" style="width:100%; height:100%; display:flex; flex-direction:column; gap:20px; align-items:center; padding:20px; box-sizing:border-box; overflow-y:auto;">
      <h2 style="text-align:center; margin-bottom:10px;">Creador de Escape Rooms</h2>

      <!-- Importar datos existentes -->
      <div style="width:100%; max-width:900px; background:#f9fafb; padding:20px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
        <h3 style="margin-bottom:10px;">Importar Escape Room existente</h3>
        <label for="importarJuego" style="font-weight:bold;">Selecciona:</label>
        <select id="importarJuego" style="padding:8px 12px; margin-left:8px; border-radius:6px; border:1px solid #d1d5db;">
          <option value="">-- Ninguno --</option>
          ${juegosExistentes.map(j => `<option value="${j.juegoID}">${j.titulo}</option>`).join("")}
        </select>
        <button id="btn-importar" style="margin-left:10px; padding:8px 14px; border:none; background:#3b82f6; color:white; border-radius:6px; cursor:pointer;">Importar</button>
      </div>

      <form id="form-escape-room" style="width:100%; max-width:900px; display:flex; flex-direction:column; gap:20px;">
        <!-- Datos del Juego -->
        <div style="background:#f9fafb; padding:20px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
          <h3 style="margin-bottom:15px;">Datos del Juego</h3>
          <label>Título:</label>
          <input type="text" id="titulo" required style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
          
          <label>Narrativa inicial:</label>
          <textarea id="narrativa" rows="3" required style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #d1d5db; border-radius:6px;"></textarea>
          
          <label>Fallos máximos por puzle:</label>
          <input type="number" id="fallosMaximos" min="1" value="3" required style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
          
          <label>Tipo de portada:</label>
          <select id="tipoPortada" style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
            <option value="hab_oscura" selected>Habitación Oscura</option>
            <option value="laboratorio">Laboratorio</option>
            <option value="pasillo">Pasillo</option>
            <option value="sala_miedo">Sala de Miedo</option>
          </select>
          
          <label>Curso:</label>
          <input type="text" id="curso" required style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px;">
        </div>

        <!-- Puzles -->
        <div style="background:#f9fafb; padding:20px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.1); display:flex; flex-direction:column;">
          <h3 style="margin-bottom:15px;">Puzles</h3>
          <div id="lista-puzles" style="flex:1; overflow-y:auto; max-height:60vh; padding-right:5px;"></div>
          <button type="button" id="btn-agregar-puzle" style="margin-top:10px; padding:10px 16px; border:none; background:#10b981; color:white; border-radius:6px; cursor:pointer; font-size:1em;">Agregar Puzle</button>
        </div>

        <div style="text-align:center; margin-top:10px;">
          <button type="submit" style="background:#10b981; color:white; padding:14px 22px; border:none; border-radius:8px; cursor:pointer; font-size:1.1em;">Guardar Escape Room</button>
        </div>
      </form>
    </div>
  `;

  const listaPuzles = document.getElementById("lista-puzles");
  let contadorPuzles = 0;

  function mapTipo(raw) {
    const t = String(raw || '').toLowerCase().replace(/_/g, '-');
    if (/cesar/.test(t)) return 'cifrado-cesar';
    if (/acert|riddle/.test(t)) return 'acertijo';
    if (/logic/.test(t) || t === 'logica') return 'logica';
    return 'acertijo';
  }

  function normalizaPuzle(p, idx) {
      const pistas = Array.isArray(p?.pistas)
        ? p.pistas
        : typeof p?.pistas === 'string'
          ? p.pistas.split(/[;,\n]/).map(s => s.trim()).filter(Boolean)
          : [];
      const tiempo = p?.tiempo_estimado_segundos ?? p?.tiempoEstimadoSegundos ?? p?.tiempo ?? 60;
    
      return {
        puzleID: idx + 1,
        tipo: mapTipo(p?.tipo || p?.tipo_puzle || p?.type),
        instruccion: p?.instruccion ?? p?.enunciado ?? p?.texto ?? '',
        respuestaCorrecta: p?.respuestaCorrecta ?? p?.respuesta ?? '',
        tiempo_estimado_segundos: Number.isFinite(+tiempo) ? +tiempo : 60,
        pistas,
        narrativa: p?.narrativa ?? p?.narrativaPuzle ?? p?.narrativa_post ?? '',
        claveCifrado: p?.claveCifrado ?? p?.clave ?? p?.datos?.claveCifrado ?? p?.datos?.clave ?? ''
      };
  }

  function crearPuzleFormulario(puzleId, datos = {}) {
    const div = document.createElement("div");
    div.className = "puzle";
    div.dataset.id = puzleId;
    div.style = "background:#fff; margin-bottom:15px; padding:15px; border:1px solid #d1d5db; border-radius:8px; position:relative;";
  
    div.innerHTML = `
      <button type="button" class="btn-borrar" 
        style="position:absolute; top:10px; right:10px; background:#ef4444; color:white; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px;">✖</button>
      <h4 style="margin-bottom:10px;">Puzle ${puzleId + 1}</h4>
      
      <label>Tipo:</label>
      <select class="tipo-puzle" style="width:100%; margin-bottom:8px; padding:6px; border:1px solid #d1d5db; border-radius:6px;">
        <option value="cifrado-cesar" ${datos.tipo==="cifrado-cesar"?"selected":""}>Cifrado César</option>
        <option value="acertijo" ${datos.tipo==="acertijo"?"selected":""}>Acertijo</option>
        <option value="logica" ${datos.tipo==="logica"?"selected":""}>Lógica</option>
      </select>

      <label>Instrucción:</label>
      <textarea class="instruccion" rows="2" required style="width:100%; margin-bottom:8px; padding:6px; border:1px solid #d1d5db; border-radius:6px;">${datos.instruccion||""}</textarea>

      <label>Respuesta correcta:</label>
      <input type="text" class="respuestaCorrecta" value="${Array.isArray(datos.respuestaCorrecta) ? (datos.respuestaCorrecta[0] || "") : (datos.respuestaCorrecta || "")}" required style="width:100%; margin-bottom:8px; padding:6px; border:1px solid #d1d5db; border-radius:6px;">

      <div class="clave-cifrado-container" style="display:none; margin-bottom:8px;">
        <label>Clave de cifrado:</label>
        <input type="text" class="claveCifrado" value="${datos.claveCifrado||""}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:6px;">
      </div>

      <label>Tiempo estimado (segundos):</label>
      <input type="number" class="tiempoEstimado" min="1" value="${Number.isFinite(+datos.tiempo_estimado_segundos) ? +datos.tiempo_estimado_segundos : 60}" required style="width:100%; margin-bottom:8px; padding:6px; border:1px solid #d1d5db; border-radius:6px;">

      <label>Pistas (separadas por ;):</label>
      <input type="text" class="pistas" value="${Array.isArray(datos.pistas)?datos.pistas.join("; "):(datos.pistas||"")}" style="width:100%; margin-bottom:8px; padding:6px; border:1px solid #d1d5db; border-radius:6px;">

      <label>Narrativa tras superar puzle:</label>
      <textarea class="narrativaPuzle" rows="2" style="width:100%; margin-bottom:8px; padding:6px; border:1px solid #d1d5db; border-radius:6px;">${datos.narrativa||""}</textarea>
    `;
  
    const selectTipo = div.querySelector(".tipo-puzle");
    const claveContainer = div.querySelector(".clave-cifrado-container");

    function actualizarClave() {
      claveContainer.style.display = selectTipo.value === "cifrado-cesar" ? "block" : "none";
    }
    actualizarClave();
    selectTipo.addEventListener("change", actualizarClave);

    div.querySelector(".btn-borrar").onclick = () => {
      div.remove();
      const puzlesRestantes = listaPuzles.querySelectorAll(".puzle");
      puzlesRestantes.forEach((p,index)=>{
        p.querySelector("h4").textContent = `Puzle ${index+1}`;
        p.dataset.id = index;
      });
      contadorPuzles = puzlesRestantes.length;
    };
    listaPuzles.appendChild(div);
  }

  // Al menos un puzle en blanco al abrir
  crearPuzleFormulario(contadorPuzles++);

  document.getElementById("btn-agregar-puzle").onclick = () => crearPuzleFormulario(contadorPuzles++);

  // IMPORTAR
  document.getElementById("btn-importar").onclick = () => {
    const id = document.getElementById("importarJuego").value;
    if (!id) return alert("Selecciona un escape room para importar");

    // USAR juegoID (no id)
    const juegoOriginal = juegosExistentes.find(j => String(j.juegoID) === String(id));
    if (!juegoOriginal) return alert("No se encontró el juego seleccionado");

    // Rellenar datos del juego
    document.getElementById("titulo").value = juegoOriginal.titulo || "";
    document.getElementById("narrativa").value = juegoOriginal.narrativa || "";
    document.getElementById("fallosMaximos").value = Number.isFinite(+juegoOriginal.fallosmaximospuzle) ? +juegoOriginal.fallosmaximospuzle : 3;
    document.getElementById("tipoPortada").value = juegoOriginal.tipo_portada || "hab_oscura";
    document.getElementById("curso").value = juegoOriginal.curso || "";

    // Normalizar y generar TODOS los puzles
    listaPuzles.innerHTML = "";
    contadorPuzles = 0;
    const puzles = Array.isArray(juegoOriginal.puzles) ? juegoOriginal.puzles : [];
    puzles.map((p, idx) => normalizaPuzle(p, idx))
          .forEach(p => crearPuzleFormulario(contadorPuzles++, p));
    
    // Si no había puzles, deja uno en blanco
    if (contadorPuzles === 0) crearPuzleFormulario(contadorPuzles++);
  };

  // GUARDAR
  document.getElementById("form-escape-room").onsubmit = (e) => {
    e.preventDefault();

    const juego = {
      titulo: document.getElementById("titulo").value.trim(),
      narrativa: document.getElementById("narrativa").value.trim(),
      fallosMaximosPuzle: parseInt(document.getElementById("fallosMaximos").value) || 3,
      tipo_portada: document.getElementById("tipoPortada").value,
      curso: document.getElementById("curso").value.trim(),
      puzles: []
    };

    if (!juego.titulo || !juego.narrativa || !juego.curso) {
      return alert("Completa todos los campos obligatorios");
    }

    document.querySelectorAll("#lista-puzles .puzle").forEach((p, index) => {
      const tiempo = parseInt(p.querySelector(".tiempoEstimado").value) || 60;
      const puzleObj = {
        puzleID: index + 1,
        tipo: p.querySelector(".tipo-puzle").value,
        instruccion: p.querySelector(".instruccion").value.trim(),
        respuestaCorrecta: p.querySelector(".respuestaCorrecta").value.trim(),
        pistas: p.querySelector(".pistas").value.split(";").map(s => s.trim()).filter(Boolean),
        narrativa: p.querySelector(".narrativaPuzle").value.trim(),
        tiempoEstimadoSegundos: tiempo
      };
      const clave = p.querySelector(".claveCifrado")?.value.trim();
      if (clave) puzleObj.claveCifrado = clave;
      juego.puzles.push(puzleObj);
    });

    handleMessageToSkill({ action: "guardar_nuevo_escape_room", datos: juego });
    alert("Escape Room enviado para guardar en la base de datos.");
  };
}

// Temporizador puzles
function iniciarContador(tiempoMaximo) {
    clearInterval(intervalContador);

    let tiempoRestante = tiempoMaximo;
    const contadorDiv = document.getElementById('contador');
    contadorDiv.style.display = "block";
    contadorDiv.textContent = `Tiempo restante: ${tiempoRestante} s`;

    intervalContador = setInterval(() => {
        tiempoRestante -= 1;

        if (tiempoRestante <= 0) {
            clearInterval(intervalContador);
            contadorDiv.textContent = "¡Se acabó el tiempo!";

            logToCloudwatch("Tiempo agotado → enviando mensaje a Alexa");
            tiempoAgotado();
        } else {
            contadorDiv.textContent = `Tiempo restante: ${tiempoRestante} s`;
        }
    }, 1000);
}

// Mostrar pista en pantalla
function mostrarPista(texto) {
    const pistaDiv = document.getElementById("pista-container");
    pistaDiv.style.display = "block";
    pistaDiv.textContent = texto;
    logToCloudwatch("Mostrando pista: " + texto);
}

// Eliminar pista de la pantalla
function ocultarPista() {
    const pistaDiv = document.getElementById("pista-container");
    pistaDiv.style.display = "none";
    pistaDiv.textContent = "";
    logToCloudwatch("Ocultando pista");
}

/* ===================== REGISTRO/LOGIN USUARIOS ===================== */

// Formulario alumno -> Únicamente login sencillo
function mostrarFormularioAlumno() {
    document.getElementById("menu-inicial").innerHTML = `
      <form id="form-alumno">
        <label>Nombre:</label>
        <input type="text" id="nombreAlumno" required>
        <label>Curso:</label>
        <input type="text" id="cursoAlumno" required>
        <label>Grupo:</label>
        <input type="text" id="grupoAlumno" required>
        <button type="submit">Entrar</button>
        <button type="button" onclick="mostrarMenuInicial()">Volver atrás</button>
      </form>
    `;

    document.getElementById("form-alumno").onsubmit = (e) => {
        e.preventDefault();
        const alumno = {
            nombre: document.getElementById("nombreAlumno").value,
            curso: document.getElementById("cursoAlumno").value,
            grupo: document.getElementById("grupoAlumno").value
        };
        handleMessageToSkill({ action: "login_alumno", datos: alumno });
    };
}

// Formulario docente -> Login con usuario y contraseña
function mostrarFormularioDocente() {
    document.getElementById("menu-inicial").innerHTML = `
      <form id="form-docente">
        <label>Usuario:</label>
        <input type="text" id="usuarioDocente" required>
        <label>Contraseña:</label>
        <input type="password" id="passwordDocente" required>
        <button type="submit">Entrar</button>
        <button type="button" onclick="mostrarRegistroDocente()">Registrarse</button>
        <button type="button" onclick="mostrarMenuInicial()">Volver atrás</button>
      </form>
    `;

    document.getElementById("form-docente").onsubmit = (e) => {
        e.preventDefault();
        const docente = {
            usuario: document.getElementById("usuarioDocente").value,
            password: document.getElementById("passwordDocente").value
        };
        handleMessageToSkill({ action: "login_docente", datos: docente });
    };
}

// Formulario docente -> Registro con nombre, usuario y contraseña
function mostrarRegistroDocente() {
    document.getElementById("menu-inicial").innerHTML = `
      <form id="registro-docente">
        <label>Nombre:</label>
        <input type="text" id="nombreDocente" required>
        <label>Usuario:</label>
        <input type="text" id="usuarioNuevo" required>
        <label>Contraseña:</label>
        <input type="password" id="passwordNuevo" required>
        <button type="submit">Registrarse</button>
        <button type="button" onclick="mostrarMenuInicial()">Volver atrás</button>
      </form>
    `;

    document.getElementById("registro-docente").onsubmit = (e) => {
        e.preventDefault();
        const docente = {
            nombre: document.getElementById("nombreDocente").value,
            usuario: document.getElementById("usuarioNuevo").value,
            password: document.getElementById("passwordNuevo").value
        };
        handleMessageToSkill({ action: "registrar_docente", datos: docente });
        mostrarMenuInicial();
    };
}

// Formulario coordinador -> Login con usuario y contraseña
function mostrarFormularioCoordinador() {
    document.getElementById("menu-inicial").innerHTML = `
      <form id="form-coordinador">
        <label>Usuario:</label>
        <input type="text" id="usuarioCoordinador" required>
        <label>Contraseña:</label>
        <input type="password" id="passwordCoordinador" required>
        <button type="submit">Entrar</button>
        <button type="button" onclick="mostrarRegistroCoordinador()">Registrarse</button>
        <button type="button" onclick="mostrarMenuInicial()">Volver atrás</button>
      </form>
    `;

    document.getElementById("form-coordinador").onsubmit = (e) => {
        e.preventDefault();
        const coordinador = {
            usuario: document.getElementById("usuarioCoordinador").value,
            password: document.getElementById("passwordCoordinador").value
        };
        handleMessageToSkill({ action: "login_coordinador", datos: coordinador });
    };
}

// Formulario coordinador -> Registro con nombre, usuario y contraseña
function mostrarRegistroCoordinador() {
    document.getElementById("menu-inicial").innerHTML = `
      <form id="registro-coordinador">
        <label>Nombre:</label>
        <input type="text" id="nombreCoordinador" required>
        <label>Usuario:</label>
        <input type="text" id="usuarioNuevoCoordinador" required>
        <label>Contraseña:</label>
        <input type="password" id="passwordNuevoCoordinador" required>
        <button type="submit">Registrarse</button>
        <button type="button" onclick="mostrarMenuInicial()">Volver atrás</button>
      </form>
    `;

    document.getElementById("registro-coordinador").onsubmit = (e) => {
        e.preventDefault();
        const coordinador = {
            nombre: document.getElementById("nombreCoordinador").value,
            usuario: document.getElementById("usuarioNuevoCoordinador").value,
            password: document.getElementById("passwordNuevoCoordinador").value
        };
        handleMessageToSkill({ action: "registrar_coordinador", datos: coordinador });
        mostrarMenuInicial();
    };
}

/* ===================== HANDLERS ===================== */


// Mensajes recibidos de la skill 
function handleMessageFromSkill(message) {
    if (!document.getElementById('iframe-container')) {
        document.addEventListener('DOMContentLoaded', () => handleMessageFromSkill(message));
        return;
    }

    if (message.action === "mostrar_puzle") {
        let url = "";
        const tiempoMaximo = message.tiempoMaximo || 0;

        switch (message.tipo) {
            case "cifrado-cesar":
                if (message.datos) {
                    const mensaje = encodeURIComponent(message.datos);
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega4/paginas_puzles/cifrado_cesar.html?mensajeCifrado=${mensaje}`;
                }
                break;

            case "acertijo":
                if (message.instruccion) {
                    const instr = encodeURIComponent(message.instruccion);
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega4/paginas_puzles/acertijo.html?instruccion=${instr}`;
                }
                break;

            case "logica":
                if (message.instruccion) {
                    const instr = encodeURIComponent(message.instruccion);
                    url = `https://d1qeen6fmshz39.cloudfront.net/entrega4/paginas_puzles/logica.html?instruccion=${instr}`;
                }
                break;

            default:
                logToCloudwatch("Tipo de puzle no reconocido: " + message.tipo);
                break;
        }

        if (url) {
            document.getElementById('iframe-container').innerHTML = `
                <iframe src="${url}" title="${message.tipo}"></iframe>
            `;
            
            if (tiempoMaximo > 0) {
                iniciarContador(tiempoMaximo);
            } else {
                document.getElementById('contador').style.display = "none";
            }

            ocultarPista();
        }
    } 
    else if (message.action === "mostrar_pista") {
        mostrarPista(message.pista);
    }
    else if (message.action === "mostrar_portada") {
      const tipo = message.tipo || 'hab_oscura';
      const urlImagen = `https://d1qeen6fmshz39.cloudfront.net/entrega4/portadas_base/${tipo}.jpg`;
  
      document.getElementById('iframe-container').innerHTML = `
          <img src="${urlImagen}" alt="${tipo}"
           style="
             max-width: 95vw;
             max-height: 90vh;
             width: auto;
             height: auto;
             object-fit: contain;
             border-radius: 10px;
             display: block;
             margin: auto;
           "
          />
      `;
    }
    else if (message.action === "login_exitoso") {
        const menuDiv = document.getElementById("menu-inicial");
        if (menuDiv) {
          menuDiv.style.display = "none";
        }
    }
    else if (message.action === "abrir_editor_escape_room") {
        mostrarEditorEscapeRoom(message.datos || []);
    }
    else if (message.action === "guardado_juego_exitoso") {
        // Mostrar título en el iframe-container
        const container = document.getElementById('iframe-container');
        container.innerHTML = `<h1>ESCAPE ROOM CREATOR</h1>`;
    }
    else if (message.action === "mostrar_resultados_alumno") {
      const resultados = message.datos || [];
      const container = document.getElementById('iframe-container');
    
      if (resultados.length === 0) {
        container.innerHTML = `
          <div style="padding:20px; text-align:center;">
            <h2>Resultados del alumno</h2>
            <p style="color:#6b7280;">No hay resultados registrados.</p>
          </div>`;
        return;
      }
    
      let html = `
        <h2 style="text-align:center; margin-bottom:15px;">📊 Resultados del alumno</h2>
        <div style="
          display: grid; 
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 15px;
          padding: 10px;
          max-height: 70vh;
          overflow-y: auto;
        ">
      `;
    
      resultados.forEach((item, index) => {
        const inicio = new Date(item.fechaInicioJuego);
        const fin = new Date(item.fechaFinJuego);
        const tiempoSegundos = Math.floor((fin - inicio) / 1000);
    
        html += `
          <div style="
            background:#ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column;
            gap: 6px;
          ">
            <h3 style="margin:0; color:#374151; font-size:1.1em;">Resultado ${index + 1}</h3>
            <p style="margin:0; color:#374151;"><strong>❌ Fallos:</strong> ${item.fallosTotales}</p>
            <p style="margin:0; color:#374151;"><strong>✅ Puzles superados:</strong> ${item.puzlesSuperados}</p>
            <p style="margin:0; color:#4b5563; font-size:0.9em;">📅 Inicio: ${inicio.toLocaleString()}</p>
            <p style="margin:0; color:#4b5563; font-size:0.9em;">📅 Fin: ${fin.toLocaleString()}</p>
            <p style="margin:0; color:#1f2937; font-weight:bold;">⏱️ Tiempo: ${tiempoSegundos} segundos</p>
          </div>
        `;
      });
    
      html += "</div>";
      container.innerHTML = html;
    }
    else {
        logToCloudwatch("Acción no reconocida: " + message.action);
    }
}

// Mensajes enviados a la skill
function handleMessageToSkill(message) {
    if (!alexaClient) return;

    const trySend = () => {
        try {
            alexaClient.skill.sendMessage(message, (result) => {
                if (!result || result.statusCode !== 200) {
                    setTimeout(trySend, 500); // reintentar medio segundo después
                }
            });
        } catch (err) {
            setTimeout(trySend, 500); // reintentar si lanza excepción
        }
    };

    trySend();
}

/* =====================  ===================== */
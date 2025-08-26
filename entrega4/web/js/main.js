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
        <div id="editor-escape-room" style="width:100%; height:100%; display:flex; flex-direction:column; gap:20px;">
            <h2 style="text-align:center; margin-bottom:10px;">Creador de Escape Rooms</h2>
            
            <!-- Importar datos existentes -->
            <div style="text-align:center; margin-bottom:20px;">
                <label for="importarJuego" style="font-weight:bold;">Importar Escape Room existente:</label>
                <select id="importarJuego">
                    <option value="">-- Selecciona un juego --</option>
                    ${juegosExistentes.map(j => `<option value="${j.id}">${j.titulo}</option>`).join("")}
                </select>
                <button id="btn-importar">Importar</button>
            </div>

            <form id="form-escape-room" style="flex:1; display:grid; grid-template-columns: 1fr 1fr; gap:20px;">

                <!-- Bloque Datos del Juego -->
                <div style="background:#f3f4f6; padding:20px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
                    <h3>Datos del Juego</h3>
                    <label>Título:</label>
                    <input type="text" id="titulo" required><br>

                    <label>Narrativa inicial:</label>
                    <textarea id="narrativa" rows="3" required></textarea><br>

                    <label>Fallos máximos por puzle:</label>
                    <input type="number" id="fallosMaximos" min="1" value="3" required><br>

                    <label>Tipo de portada:</label>
                    <select id="tipoPortada">
                        <option value="default">Default</option>
                        <option value="tipo1">Tipo 1</option>
                        <option value="tipo2">Tipo 2</option>
                    </select><br>

                    <label>Curso:</label>
                    <input type="text" id="curso" required><br>
                </div>

                <!-- Bloque Puzles -->
                <div style="background:#f3f4f6; padding:20px; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.1); display:flex; flex-direction:column;">
                    <h3>Puzles</h3>
                    <div id="lista-puzles" style="flex:1; overflow-y:auto; max-height:60vh; padding-right:5px;"></div>
                    <button type="button" id="btn-agregar-puzle" style="margin-top:10px;">➕ Agregar Puzle</button>
                </div>

                <div style="grid-column: span 2; text-align:center; margin-top:20px;">
                    <button type="submit" style="background:#10b981; color:white; padding:12px 20px; border:none; border-radius:8px; cursor:pointer; font-size:1.1em;">💾 Guardar Escape Room</button>
                </div>
            </form>
        </div>
    `;

    const listaPuzles = document.getElementById("lista-puzles");
    let contadorPuzles = 0;

    function crearPuzleFormulario(puzleId, datos = {}) {
        const div = document.createElement("div");
        div.className = "puzle";
        div.dataset.id = puzleId;
        div.style = "background:#fff; margin-bottom:15px; padding:15px; border:1px solid #d1d5db; border-radius:8px; position:relative;";

        div.innerHTML = `
            <button type="button" class="btn-borrar" style="position:absolute; top:10px; right:10px; background:#ef4444; color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer;">✖</button>
            <h4>Puzle ${puzleId + 1}</h4>
            
            <label>Tipo:</label>
            <select class="tipo-puzle">
                <option value="cifrado-cesar" ${datos.tipo==="cifrado-cesar"?"selected":""}>Cifrado César</option>
                <option value="acertijo" ${datos.tipo==="acertijo"?"selected":""}>Acertijo</option>
                <option value="logica" ${datos.tipo==="logica"?"selected":""}>Lógica</option>
            </select><br>

            <label>Instrucción:</label>
            <textarea class="instruccion" rows="2" required>${datos.instruccion||""}</textarea><br>

            <label>Respuesta correcta:</label>
            <input type="text" class="respuestaCorrecta" value="${datos.respuestaCorrecta?.[0]||""}" required><br>

            <label>Tiempo estimado (segundos):</label>
            <input type="number" class="tiempoEstimado" min="1" value="${datos.tiempo_estimado_segundos||60}" required><br>

            <label>Pistas (separadas por ;):</label>
            <input type="text" class="pistas" value="${datos.pistas?datos.pistas.join("; "):""}"><br>

            <label>Narrativa tras superar puzle:</label>
            <textarea class="narrativaPuzle" rows="2">${datos.narrativa||""}</textarea><br>
        `;

        div.querySelector(".btn-borrar").onclick = () => div.remove();
        listaPuzles.appendChild(div);
    }

    // Al menos un puzle inicial
    crearPuzleFormulario(contadorPuzles);
    contadorPuzles++;

    document.getElementById("btn-agregar-puzle").onclick = () => {
        crearPuzleFormulario(contadorPuzles);
        contadorPuzles++;
    };

    // Importar datos desde BD
    document.getElementById("btn-importar").onclick = () => {
        const id = document.getElementById("importarJuego").value;
        if (!id) return alert("Selecciona un escape room para importar");

        const juego = juegosExistentes.find(j => j.id == id);
        if (!juego) return;

        // Cargar datos generales
        document.getElementById("titulo").value = juego.titulo;
        document.getElementById("narrativa").value = juego.narrativa;
        document.getElementById("fallosMaximos").value = juego.fallosmaximospuzle;
        document.getElementById("tipoPortada").value = juego.tipo_portada;
        document.getElementById("curso").value = juego.curso;

        // Cargar puzles
        listaPuzles.innerHTML = "";
        contadorPuzles = 0;
        juego.puzles.forEach(p => {
            crearPuzleFormulario(contadorPuzles, p);
            contadorPuzles++;
        });
    };

    document.getElementById("form-escape-room").onsubmit = (e) => {
        e.preventDefault();

        // Recoger datos del juego
        const juego = {
            titulo: document.getElementById("titulo").value,
            narrativa: document.getElementById("narrativa").value,
            fallosmaximospuzle: parseInt(document.getElementById("fallosMaximos").value),
            tipo_portada: document.getElementById("tipoPortada").value,
            curso: document.getElementById("curso").value,
            puzles: []
        };

        // Recoger puzles
        document.querySelectorAll("#lista-puzles .puzle").forEach((p) => {
            const puzle = {
                tipo: p.querySelector(".tipo-puzle").value,
                instruccion: p.querySelector(".instruccion").value,
                datos: {},
                respuestaCorrecta: [p.querySelector(".respuestaCorrecta").value],
                tiempo_estimado_segundos: parseInt(p.querySelector(".tiempoEstimado").value),
                pistas: p.querySelector(".pistas").value.split(";").map(s => s.trim()).filter(s=>s),
                narrativa: p.querySelector(".narrativaPuzle").value
            };
            juego.puzles.push(puzle);
        });

        // Enviar mensaje a la skill para guardar en DynamoDB
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
                if (message.datos && message.datos.mensajeCifrado) {
                    const mensaje = encodeURIComponent(message.datos.mensajeCifrado);
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
        const tipo = message.tipo || 'default';
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
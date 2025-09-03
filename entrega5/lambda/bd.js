const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

/* ===================== CONFIGURACIÓN ===================== */

const ddb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' });

/* ===================== TABLAS ===================== */

const USUARIOS_TABLE = 'EscapeRoomUsuarios';
const JUEGOS_TABLE = 'EscapeRoomJuegos';
const SESIONES_TABLE = 'EscapeRoomSesiones';
const RESULTADOS_TABLE = 'EscapeRoomResultados';
const REPORTES_TABLE = 'EscapeRoomReportes';

/* ===================== MÉTODOS ===================== */

/* ---------------------- MÉTODOS AUXILIARES ------------------------ */

// Calcula la diferencia en segundos entre dos fechas ISO
function calcularSegundos(fechaInicio, fechaFin) {
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    return Math.floor((fin - inicio) / 1000);
}

/* ---------------------- USUARIOS ------------------------ */

// Registro docente/coordinador
async function registrarDocenteCoordinador({ nombre, usuario, password, tipo }) {
    if (!['docente', 'coordinador'].includes(tipo)) {
        return { success: false, message: 'Tipo de usuario no válido' };
    }

    const existing = await ddb.query({
        TableName: USUARIOS_TABLE,
        IndexName: 'DocentesCoordinadoresIndex',
        KeyConditionExpression: 'tipo = :tipo AND usuario = :usuario',
        ExpressionAttributeValues: {
            ':tipo': tipo,
            ':usuario': usuario
        }
    }).promise();

    if (existing.Items.length > 0) {
        return { success: false, message: `El ${tipo} ya existe` };
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    const item = {
        userID: userId,
        tipo,
        nombre,
        usuario,
        password: hashedPassword
    };

    await ddb.put({ TableName: USUARIOS_TABLE, Item: item }).promise();
    return { success: true, userId };
}

// Login docente/coordinador
async function loginDocenteCoordinador(usuario, password, tipo) {
    if (!['docente', 'coordinador'].includes(tipo)) {
        return { success: false, message: 'Tipo de usuario no válido' };
    }

    const params = {
        TableName: USUARIOS_TABLE,
        IndexName: 'DocentesCoordinadoresIndex',
        KeyConditionExpression: 'tipo = :tipo AND usuario = :usuario',
        ExpressionAttributeValues: {
            ':tipo': tipo,
            ':usuario': usuario
        }
    };

    const result = await ddb.query(params).promise();
    if (result.Items.length === 0) return { success: false, message: 'Usuario no encontrado' };

    const user = result.Items[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return { success: false, message: 'Contraseña incorrecta' };

    return { success: true, userId: user.userID, nombre: user.nombre };
}

// Login alumno (con registro si no existe)
async function loginAlumno(nombre, curso, grupo) {
    const nombreCursoGrupo = `${nombre}#${curso}#${grupo}`;

    const paramsQuery = {
        TableName: USUARIOS_TABLE,
        IndexName: 'AlumnosIndex',
        KeyConditionExpression: 'tipo = :tipo AND nombreCursoGrupo = :ncg',
        ExpressionAttributeValues: {
            ':tipo': 'alumno',
            ':ncg': nombreCursoGrupo
        }
    };

    const result = await ddb.query(paramsQuery).promise();
    if (result.Items.length > 0) {
        const alumno = result.Items[0];
        return { success: true, userId: alumno.userID, nombre: alumno.nombre };
    }

    // Registrar alumno si no existe
    const userId = uuidv4();
    const item = {
        userID: userId,
        tipo: 'alumno',
        nombre,
        curso,
        grupo,
        nombreCursoGrupo
    };

    await ddb.put({ TableName: USUARIOS_TABLE, Item: item }).promise();
    return { success: true, userId, nombre };
}

/* ---------------------- JUEGOS ------------------------ */

// Listar todos los juegos
async function listarJuegos() {
    const result = await ddb.scan({ TableName: JUEGOS_TABLE }).promise();
    return { success: true, juegos: result.Items || [] };
}

// Guardar nuevo juego (sin duplicados por título)
async function guardarJuego(juego) {
    // 1. Comprobar si ya existe el título
    const existing = await ddb.query({
        TableName: JUEGOS_TABLE,
        IndexName: 'TituloIndex',
        KeyConditionExpression: 'titulo = :t',
        ExpressionAttributeValues: { ':t': juego.titulo }
    }).promise();

    if (existing.Items.length > 0) {
        return { success: false, message: `Ya existe un juego con el título "${juego.titulo}"` };
    }

    // 2. Guardar juego si no existe
    const item = {
        juegoID: uuidv4(),
        titulo: juego.titulo,
        narrativa: juego.narrativa,
        fallosMaximosPuzle: juego.fallosMaximosPuzle,
        tipo_portada: juego.tipo_portada,
        curso: juego.curso,
        puzles: juego.puzles,
        fecha_creacion: new Date().toISOString(),
    };

    await ddb.put({ TableName: JUEGOS_TABLE, Item: item }).promise();
    return { success: true, juego: item };
}

// Buscar juego por título
async function buscarJuegoPorTitulo(titulo) {
    const result = await ddb.scan({ TableName: JUEGOS_TABLE }).promise();
    const juegosFiltrados = result.Items.filter(j => j.titulo.toLowerCase() === titulo);

    return { success: true, juegos: juegosFiltrados };
}

// Buscar juego por ID
async function buscarJuegoPorID(juegoID) {
    if (!juegoID) return { success: false, juego: null };

    const params = {
        TableName: JUEGOS_TABLE,
        Key: { juegoID }
    };

    const result = await ddb.get(params).promise();
    return { success: true, juego: result.Item };
}

/* ---------------------- SESIONES ------------------------ */

// Crear Sesión
async function crearSesion(userID, tipoUsuario, juegoID = null) {
    const sesionID = uuidv4();
    const item = {
        userID,
        sesionID,
        tipoUsuario,
        juegoID,
        puzleActual: 0,
        puzleIniciado: false,
        puzleTiempoActivo: false,
        fallosPuzle: 0,
        fallosTotales: 0,
        puzlesSuperados: 0,
        fechaInicioJuego: null,
        fechaFinJuego: null,
        fechaCreacion: new Date().toISOString()
    };

    await ddb.put({ TableName: SESIONES_TABLE, Item: item }).promise();
    return { success: true, sesionID, item };
}

// Obtener Sesión
async function obtenerSesion(userID, sesionID) {
    const params = {
        TableName: SESIONES_TABLE,
        Key: { userID, sesionID }
    };
    const result = await ddb.get(params).promise();
    return result.Item || null;
}

// Actualizar Sesión
async function actualizarSesion(userID, sesionID, cambios) {
    const updateExpr = [];
    const exprAttrValues = {};

    for (const key in cambios) {
        updateExpr.push(`${key} = :${key}`);
        exprAttrValues[`:${key}`] = cambios[key];
    }

    const params = {
        TableName: SESIONES_TABLE,
        Key: { userID, sesionID },
        UpdateExpression: `SET ${updateExpr.join(', ')}`,
        ExpressionAttributeValues: exprAttrValues,
        ReturnValues: "ALL_NEW"
    };

    const result = await ddb.update(params).promise();
    return result.Attributes;
}

// Borrar Sesión
async function eliminarSesion(userID, sesionID) {
    const params = {
        TableName: SESIONES_TABLE,
        Key: { userID, sesionID }
    };
    await ddb.delete(params).promise();
    return { success: true };
}

/* ---------------------- RESULTADOS ------------------------ */

// Guardar resultado de una sesión
async function guardarResultado({ userID, fallosTotales, puzlesSuperados, fechaInicioJuego, fechaFinJuego }) {
    const resultadoID = uuidv4();

    const item = {
        userID,
        resultadoID,
        fallosTotales: fallosTotales || 0,
        puzlesSuperados: puzlesSuperados || 0,
        fechaInicioJuego: fechaInicioJuego || new Date().toISOString(),
        fechaFinJuego: fechaFinJuego || new Date().toISOString()
    };

    await ddb.put({ TableName: RESULTADOS_TABLE, Item: item }).promise();
    return { success: true, resultadoID };
}

// Obtener los resultados de un alumno
async function obtenerResultadosAlumno(nombre, curso, grupo) {
    // Normalización: 
    // - Nombre: primera letra mayúscula, resto minúscula
    // - Grupo: mayúsculas
    // - Curso: string tal cual
    const nombreNormalizado = nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
    const grupoNormalizado = grupo.toUpperCase();
    const cursoStr = curso.toString();

    const nombreCursoGrupo = `${nombreNormalizado}#${cursoStr}#${grupoNormalizado}`;

    const paramsQueryAlumno = {
        TableName: USUARIOS_TABLE,
        IndexName: 'AlumnosIndex',
        KeyConditionExpression: 'tipo = :tipo AND nombreCursoGrupo = :ncg',
        ExpressionAttributeValues: {
            ':tipo': 'alumno',
            ':ncg': nombreCursoGrupo
        }
    };

    const resultAlumno = await ddb.query(paramsQueryAlumno).promise();
    if (!resultAlumno.Items || resultAlumno.Items.length === 0) {
        return { success: false, message: 'Alumno no encontrado' };
    }

    const alumno = resultAlumno.Items[0];
    const userID = alumno.userID;

    const paramsResultados = {
        TableName: RESULTADOS_TABLE,
        KeyConditionExpression: 'userID = :uid',
        ExpressionAttributeValues: {
            ':uid': userID
        }
    };

    const resultResultados = await ddb.query(paramsResultados).promise();

    return { success: true, resultados: resultResultados.Items || [] };
}

/* ---------------------- REPORTES ------------------------ */

// Generar reporte por clase (curso + grupo)
async function generarReporteClase(curso, grupo) {
    const cursoStr = curso.toString();
    const grupoStr = grupo.toUpperCase();

    // 1. Obtener todos los alumnos del curso y grupo mediante scan
    const paramsAlumnos = {
        TableName: USUARIOS_TABLE,
        FilterExpression: '#tipo = :tipo AND #curso = :curso AND #grupo = :grupo',
        ExpressionAttributeNames: {
            '#tipo': 'tipo',
            '#curso': 'curso',
            '#grupo': 'grupo'
        },
        ExpressionAttributeValues: {
            ':tipo': 'alumno',
            ':curso': cursoStr,
            ':grupo': grupoStr
        }
    };

    const alumnosResult = await ddb.scan(paramsAlumnos).promise();
    const alumnos = alumnosResult.Items || [];

    if (alumnos.length === 0) {
        return { success: false, message: `No se encontraron alumnos en el curso ${curso} grupo ${grupo}` };
    }

    // 2. Obtener resultados de todos los alumnos
    let totalFallos = 0;
    let totalPuzles = 0;
    let totalTiempo = 0;
    let totalResultados = 0;

    for (const alumno of alumnos) {
        const paramsResultados = {
            TableName: RESULTADOS_TABLE,
            KeyConditionExpression: 'userID = :uid',
            ExpressionAttributeValues: { ':uid': alumno.userID }
        };

        const resultadosAlumno = await ddb.query(paramsResultados).promise();
        const resultados = resultadosAlumno.Items || [];

        for (const r of resultados) {
            totalFallos += r.fallosTotales || 0;
            totalPuzles += r.puzlesSuperados || 0;
            totalTiempo += calcularSegundos(r.fechaInicioJuego, r.fechaFinJuego);
            totalResultados++;
        }
    }

    if (totalResultados === 0) {
        return { success: false, message: `No se encontraron resultados de alumnos en el curso ${curso} grupo ${grupo}` };
    }

    // 3. Calcular promedios
    const promedioFallos = totalFallos / totalResultados;
    const promedioPuzles = totalPuzles / totalResultados;
    const promedioTiempoSegundos = totalTiempo / totalResultados;

    // 4. Crear reporte
    const reportID = uuidv4();
    const cursoGrupo = `${cursoStr}#${grupoStr}`;
    const itemReporte = {
        cursoGrupo,
        reportID,
        fechaGeneracion: new Date().toISOString(),
        totalAlumnos: alumnos.length,
        totalResultados,
        promedioFallos,
        promedioPuzles,
        promedioTiempoSegundos
    };

    await ddb.put({ TableName: REPORTES_TABLE, Item: itemReporte }).promise();

    return { success: true, reporte: itemReporte };
}

// Obtener reportes de una clase (curso + grupo)
async function obtenerReportesClase(curso, grupo) {
    const cursoStr = curso.toString();
    const grupoStr = grupo.toUpperCase();
    const cursoGrupo = `${cursoStr}#${grupoStr}`;

    const params = {
        TableName: REPORTES_TABLE,
        KeyConditionExpression: "cursoGrupo = :cg",
        ExpressionAttributeValues: {
            ":cg": cursoGrupo
        },
        ScanIndexForward: false
    };

    try {
        const result = await ddb.query(params).promise();

        if (!result.Items || result.Items.length === 0) {
            return {
                success: false,
                message: `No se encontraron reportes para el curso ${curso} grupo ${grupo}`
            };
        }

        return {
            success: true,
            reportes: result.Items
        };
    } catch (err) {
        console.error("Error al obtener reportes:", err);
        return {
            success: false,
            message: "Error interno al obtener los reportes"
        };
    }
}

/* ---------------------- EXPORTS ------------------------ */

module.exports = { 
    registrarDocenteCoordinador, 
    loginDocenteCoordinador, 
    loginAlumno, 
    listarJuegos,
    guardarJuego,
    buscarJuegoPorTitulo,
    buscarJuegoPorID,
    crearSesion,
    obtenerSesion,
    actualizarSesion,
    eliminarSesion,
    guardarResultado,
    obtenerResultadosAlumno,
    generarReporteClase,
    obtenerReportesClase
};
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

/* ===================== CONFIGURACIÓN ===================== */

const ddb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' });

/* ===================== TABLAS ===================== */

const USUARIOS_TABLE = 'EscapeRoomUsuarios';

/* ===================== MÉTODOS ===================== */

// Registro profesor
async function registrarProfesor(profesor) {
    // Verificar si el usuario ya existe
    const existing = await ddb.query({
        TableName: USUARIOS_TABLE,
        IndexName: 'ProfesoresIndex',
        KeyConditionExpression: 'tipo = :tipo AND usuario = :usuario',
        ExpressionAttributeValues: {
            ':tipo': 'profesor',
            ':usuario': profesor.usuario
        }
    }).promise();

    if (existing.Items.length > 0) {
        return { success: false, message: 'El usuario ya existe' };
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(profesor.password, 10); // hash seguro

    const item = {
        userID: userId,
        tipo: 'profesor',
        nombre: profesor.nombre,
        usuario: profesor.usuario,
        password: hashedPassword
    };

    await ddb.put({ TableName: USUARIOS_TABLE, Item: item }).promise();
    return { success: true, userId };
}

// Login profesor
async function loginProfesor(usuario, password) {
    const params = {
        TableName: USUARIOS_TABLE,
        IndexName: 'ProfesoresIndex',
        KeyConditionExpression: 'tipo = :tipo AND usuario = :usuario',
        ExpressionAttributeValues: {
            ':tipo': 'profesor',
            ':usuario': usuario
        }
    };

    const result = await ddb.query(params).promise();
    if (result.Items.length === 0) return { success: false, message: 'Usuario no encontrado' };

    const prof = result.Items[0];
    const passwordMatch = await bcrypt.compare(password, prof.password);
    if (!passwordMatch) return { success: false, message: 'Contraseña incorrecta' };

    return { success: true, userId: prof.userID, nombre: prof.nombre };
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

module.exports = { registrarProfesor, loginProfesor, loginAlumno };
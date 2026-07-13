/**
 * Shared data shapes for COFEPRIS "permiso sanitario de importación de
 * medicamentos" procedures (260204, 260210, …).
 *
 * These procedures share ~all of the Paso-1 form (Datos de la solicitud tab:
 * establecimiento, S.C.I.A.N., licencia/régimen/aduana, Mercancía modal,
 * manifiestos, hacer-públicos, representante legal) and the Terceros modals.
 * The shared step sequences live in CofeprisRegistrationFlow; these are the
 * data shapes those steps consume. Procedure-specific extras (which terceros to
 * add, pago, documents) are composed on top in each procedure's own data type.
 */

import { EfirmaCredentials } from './index';

export interface SolicitanteData {
  rfc: string;
  razonSocial: string;
  correo: string;
  codigoPostal: string;
  estado: string;
}

export interface EstablecimientoData {
  rfcResponsable: string;
  denominacion: string;
  correo: string;
  codigoPostal: string;
  estado: string;
  municipio: string;
  calle: string;
  telefono: string;
}

export interface MercanciaData {
  clasificacionProducto: string;
  especificarClasificacion: string;
  denominacionEspecifica: string;
  denominacionDistintiva: string;
  denominacionComun: string;
  tipoProducto: string;
  formaFarmaceutica: string;
  estadoFisico: string;
  fraccionArancelaria: string;
  descripcionFraccion: string;
  cantidadUmt: string;
  umt: string;
  cantidadUmc: string;
  umc: string;
  presentacion: string;
  numeroRegistroSanitario: string;
  /** Materias-primas modals (260203) collect a "Marcas distintivas" detalle field. */
  marcasDistintivas?: string;
  fechaCaducidad: string;
  paisOrigen: string;
  paisProcedencia: string;
  usoEspecifico: string;
}

export interface RepresentanteLegalData {
  rfc: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

/**
 * A "tercero relacionado" (Fabricante / Destinatario / Proveedor / Facturador).
 * The cascading-address modals share this shape; optional fields are filled only
 * when present so a procedure that omits them (260204) behaves unchanged while a
 * procedure that supplies them (260210 destinatario) fills them in.
 */
export interface TerceroData {
  nacionalidad?: string;
  tipoPersona: string;
  rfc: string;
  nombre: string;
  primerApellido: string;
  segundoApellido?: string;
  pais: string;
  estado: string;
  municipio: string;
  localidad: string;
  codigoPostal: string;
  colonia: string;
  calle: string;
  numeroExterior: string;
  telefono?: string;
  correo?: string;
  curp?: string;
}

export interface PagoData {
  claveReferencia: string;
  cadenaDependencia: string;
  banco: string;
  llavePago: string;
  fechaPago: string;
  importePago: string;
}

/**
 * The data required for the shared Paso-1 registration steps (Solicitante +
 * Datos de la solicitud tabs). Each procedure's own data type extends this with
 * its procedure-specific pieces (terceros, pago, documents).
 */
export interface CofeprisRegistrationData {
  procedureCode: string;
  procedureTitle: string;
  tabs: string[];
  efirma: EfirmaCredentials;
  solicitante: SolicitanteData;
  establecimiento: EstablecimientoData;
  scian: { clave: string; descripcion: string };
  licenciaSanitaria: string;
  regimen: string;
  aduana: string;
  mercancia: MercanciaData;
  datosPublicos: string;
  representanteLegal: RepresentanteLegalData;
}

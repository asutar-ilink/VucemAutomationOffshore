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

export interface SolicitanteData {
  rfc: string;
  razonSocial: string;
  correo: string;
  codigoPostal: string;
  estado: string;
  /**
   * Full "Domicilio fiscal del solicitante" fields. Prefilled and disabled from
   * the e.firma certificate; optional so procedures that assert only the core
   * five stay unchanged, while those whose manual verifies the whole address
   * (e.g. 260215) supply and assert all of them.
   */
  pais?: string;
  municipio?: string;
  localidad?: string;
  colonia?: string;
  calle?: string;
  numeroExterior?: string;
  lada?: string;
  telefono?: string;
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
  /**
   * Localidad / Colonia / Lada are free-text inputs on the materias-primas
   * establecimiento form (260202) but absent on the medicamentos siblings'
   * form. Optional so a procedure that omits them fills only the eight core
   * fields, unchanged.
   */
  localidad?: string;
  colonia?: string;
  lada?: string;
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
  /**
   * Precursores-químicos modal (260604) fields, absent on the other modals:
   * marca comercial / DCI, porcentaje de concentración, valor comercial, the
   * "Fecha de movimiento" calendar, and a País de destino (a plain dropdown, not
   * a crosslist). Optional so the other Mercancía handlers are unaffected.
   */
  marcaComercial?: string;
  denominacionGenericaDci?: string;
  porcentajeConcentracion?: string;
  valorComercial?: string;
  fechaMovimiento?: string;
  paisDestino?: string;
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

/**
 * The Datos-de-la-solicitud data for the 260202 "materias primas" trámite,
 * which diverges from the medicamentos siblings above:
 *   - the S.C.I.A.N. table takes several claves (one is later deleted),
 *   - the establishment declares an "Aviso de funcionamiento" (a checkbox that
 *     disables the No. de licencia sanitaria field) instead of a licencia value,
 *   - selecting the AIFA aduana reveals an extra "AICM" checkbox to tick, and
 *   - the Mercancías table takes several records (one is later deleted).
 * The Mercancía modal itself is the medicamentos shape, so it is filled with
 * CofeprisRegistrationFlow.addMercanciaMedicamentos (no numeroRegistroSanitario
 * field is rendered — the handler skips it). Driven by CofeprisRegistrationFlow.
 */
export interface MateriasPrimasSolicitudData {
  establecimiento: EstablecimientoData;
  /** S.C.I.A.N. claves to add; `deleteClave` (if set) is removed after adding. */
  scians: { clave: string }[];
  deleteScianClave?: string;
  /** Tick "Aviso de funcionamiento" (disables licencia) instead of typing one. */
  avisoFuncionamiento: boolean;
  regimen: string;
  aduana: string;
  /** Tick the "Aeropuerto Internacional Ciudad de México (AICM)" checkbox. */
  aduanaAicm?: boolean;
  /** Mercancía records to add; the record at `deleteMercanciaIndex` is removed. */
  mercancias: MercanciaData[];
  deleteMercanciaIndex?: number;
  datosPublicos: string;
  representanteLegal: RepresentanteLegalData;
}

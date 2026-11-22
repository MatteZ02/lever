// Finnish user interface text. Same shape as the English table in
// strings.ts (the type checks it); keep the two in step.
import type {Strings} from './strings';

export const fi: Strings = {
  appName: 'Lever',

  project: {
    fileType: 'Lever-ratatiedosto',
    untitled: 'Uusi rata',
    openTitle: 'Avaa rata',
    saveAsTitle: 'Tallenna rata nimellä',
    exportTitle: 'Tallenna radasta kopio',
    importTitle: 'Tuo rata uutena kopiona',
    restoreTitle: 'Palauta varmuuskopio',
    z21FileType: 'Z21-sovelluksen rata',
    importZ21Title: 'Tuo ohjauspöytä Z21-sovelluksesta',
    z21Failed: 'Z21-tiedostoa ei voitu tuoda.',
    z21Imported: (stations: number) =>
      `Z21-sovelluksesta tuotiin ${stations} ${stations === 1 ? 'asema' : 'asemaa'} uutena ratana. Tallenna se, jos haluat säilyttää sen. Tarkista se kohdasta Muokkaa rataa → Ongelmat ennen ajamista.`,
    z21Issues: {
      duplicatePage: (page: string, of: string) =>
        `Sivu ”${page}” ohitettiin: kaikki sen vaihteet ovat myös sivulla ”${of}”.`,
      unknownControl: (type: number, count: number) =>
        `${count} ${count === 1 ? 'tuntematon kohde' : 'tuntematonta kohdetta'} (tyyppi ${type}) ohitettiin.`,
      oddAngle: (page: string, count: number) =>
        `${count} ${count === 1 ? 'kohde' : 'kohdetta'} sivulla ”${page}” on kulmassa, jota Lever ei osaa piirtää. Ohitettiin.`,
      invalidAddress: (page: string, address: number) =>
        `Osoite ${address} sivulla ”${page}” ei ole kelvollinen lisälaiteosoite. Kohteella ei nyt ole osoitetta.`,
      routesNotImported: (count: number) =>
        `${count} ${count === 1 ? 'kulkutiepainike' : 'kulkutiepainiketta'} jäi tuomatta: Lever laskee kulkutiet itse (taso 2).`,
      signalsAssumed: (count: number) =>
        `${count} ${count === 1 ? 'opastin tuotiin' : 'opastinta tuotiin'} kaksiopasteisina pääopastimina, ja Z21-sovelluksen ensimmäinen tila tulkittiin opasteeksi Aja. Testaa ne.`,
    },
    noBackups:
      'Varmuuskopioita on vain radalla, joka on tallennettu tiedostoksi ja avattu muokattavaksi.',
    saveFailed: 'Rataa ei voitu tallentaa.',
    openFailed: (path: string) => `Tiedostoa ”${path}” ei voitu avata.`,
    openedReadOnly:
      'Rata on muokattavana toisessa Leverissä, joten se avattiin tässä vain luettavaksi.',
    lockedBy: (host: string) =>
      `Auki koneella: ${host}. Sulje se siellä, jos haluat muokata tässä.`,
    migrated: (version: number) =>
      `Rata on tehty Leverin vanhemmalla versiolla (muoto ${version}). Se on päivitetty, ja alkuperäinen on tallessa varmuuskopioissa.`,
    saveBeforeQuit: 'Tallennetaanko uusi rata ennen sulkemista?',
    saveBeforeReplace: 'Tallennetaanko uusi rata ennen toisen avaamista?',
    unsavedDetail:
      'Sitä ei ole vielä tallennettu tiedostoon. Jos et tallenna, se katoaa.',
    saveFailedClose: 'Radan viimeisimpiä muutoksia ei voitu tallentaa.',
    saveFailedCloseDetail: 'Jos jatkat tallentamatta, nämä muutokset katoavat.',
    tryAgain: 'Yritä uudelleen',
    discardChanges: 'Hylkää muutokset',
    save: 'Tallenna…',
    dontSave: 'Älä tallenna',
    cancel: 'Peruuta',
    errors: {
      notAProject: 'Tämä ei ole Leverin ratatiedosto.',
      newerVersion:
        'Rata on tehty Leverin uudemmalla versiolla. Päivitä Lever, niin voit avata sen.',
      missingMigration: (version: number) =>
        `Lever ei osaa päivittää muodon ${version} ratoja.`,
      invalid: (details: string) =>
        `Tiedosto on vioittunut tai sitä on muokattu käsin:\n${details}`,
    },
  },

  menu: {
    file: 'Tiedosto',
    newProject: 'Uusi rata',
    open: 'Avaa…',
    save: 'Tallenna',
    saveAs: 'Tallenna nimellä…',
    exportCopy: 'Tallenna kopio…',
    importCopy: 'Tuo uutena kopiona…',
    importZ21: 'Tuo Z21-sovelluksesta…',
    restoreBackup: 'Palauta varmuuskopio…',
    quit: 'Lopeta',
    view: 'Näytä',
    zoomIn: 'Suurenna',
    zoomOut: 'Pienennä',
    resetZoom: 'Todellinen koko',
    fullScreen: 'Koko näyttö',
    developerTools: 'Kehittäjän työkalut',
    help: 'Ohje',
    about: 'Tietoja Leveristä',
  },

  about: {
    title: 'Tietoja Leveristä',
    detail: (version: string) =>
      `Versio ${version}\n\nPienoisrautatien ohjauspöytä Z21-yhteensopivalle keskusyksikölle.\nMIT-lisenssi.`,
  },

  connection: {
    disconnected: 'Ei yhteyttä',
    connecting: 'Yhdistetään…',
    connected: 'Yhdistetty',
    reconnecting: 'Yhteys katkesi, yritetään uudelleen…',
    centralUnit: 'Keskusyksikkö',
    address: 'IP-osoite',
    port: 'Portti',
    connect: 'Yhdistä',
    firmware: (version: string) => `Laiteohjelmisto ${version}`,
    unknownDevice: 'Keskusyksikkö ei kertonut tyyppiään',
  },

  hardwareTypes: {
    0x200: 'Z21 (musta, 2012)',
    0x201: 'Z21 (musta, 2013)',
    0x202: 'SmartRail',
    0x203: 'z21 (valkoinen)',
    0x204: 'z21 start',
    0x211: 'Z21 XL',
  } as Record<number, string>,

  trackStatus: {
    unknown: 'Radan tila ei tiedossa',
    normal: 'Ajovirta päällä',
    emergencyStop: 'Hätäpysäytys',
    powerOff: 'Ajovirta pois',
    shortCircuit: 'OIKOSULKU',
    programming: 'Ohjelmointitila',
  },

  stop: {
    button: 'STOP',
    buttonHint: (key: string) => `Pysäytä kaikki junat (${key})`,
    powerOn: 'Ajovirta päälle',
    powerOff: 'Ajovirta pois',
    resume: 'Jatka',
    // Second line of the track status while stopped: it is the resume button.
    clickToResume: 'Jatka napsauttamalla',
    clickToPowerOn: 'Kytke ajovirta napsauttamalla',
  },

  settings: {
    title: 'Asetukset',
    theme: 'Värit',
    themeSystem: 'Sama kuin Windowsissa',
    themeLight: 'Vaalea',
    themeDark: 'Tumma',
    language: 'Kieli',
    languageNames: {en: 'English', fi: 'Suomi'} as Record<string, string>,
    languageHelp: 'Leverin ikkunat latautuvat uudelleen uudella kielellä.',
    protocolLog: 'Protokollaloki (vianetsintään)',
    devTools: 'Kehittäjätyökalut',
    devToolsHelp:
      'Näyttää yläpalkissa painikkeet Ilmaisimet, Lisälaitetesti ja Protokollaloki.',
    quickKeys: 'Pikanäppäimet',
    quickKeysHelp:
      'Toimivat kaikissa ikkunoissa, paitsi kun kirjoitat tekstikenttään ja kun Asetukset on auki (näytön STOP-painike toimii aina). Kirjaimet toimivat Shiftin kanssa tai ilman.',
    quickKeyActions: {
      stop: 'STOP',
      resume: 'Ajovirta päälle / jatka',
      trackPowerOff: 'Ajovirta pois',
      undoRoute: 'Kumoa viimeisin kulkutie',
      newRoute: 'Uusi kulkutie',
      fitView: 'Sovita näkymään',
    } as Record<string, string>,
    changeKey: 'Vaihda',
    cancelKey: 'Peruuta',
    removeKey: 'Poista',
    pressKey: 'Paina näppäintä…',
    keyTaken: (action: string) =>
      `Näppäin on jo käytössä toiminnolle ”${action}”.`,
    keyWithModifier: 'Valitse näppäin ilman Ctrl-, Alt- tai Windows-näppäintä.',
    noKey: 'Ei mitään',
  },

  protocolLog: {
    title: 'Protokollaloki',
    empty: 'Lokissa ei ole vielä mitään.',
    clear: 'Tyhjennä',
  },

  errors: {
    invalidPort: 'Anna portti väliltä 1–65535.',
    invalidHost: 'Anna keskusyksikön IP-osoite.',
    invalidTurnoutNumber: 'Anna vaihteen numero väliltä 1–2048.',
  },

  // The eight grid directions as arrows (screen up = north).
  directionArrows: {
    E: '→',
    NE: '↗',
    N: '↑',
    NW: '↖',
    W: '←',
    SW: '↙',
    S: '↓',
    SE: '↘',
  } as Record<string, string>,

  windows: {
    open: 'Uusi ikkuna',
    openHelp:
      'Avaa tämä näkymä uuteen ikkunaan, esimerkiksi toiselle näytölle. Lever avaa ikkunansa seuraavalla kerralla samoille paikoille.',
  },

  routes: {
    title: 'Kulkutiet',
    fold: 'Piilota',
    newRoute: 'Uusi kulkutie',
    undoLast: 'Kumoa viimeisin kulkutie',
    clickStart:
      'Napsauta kulkutien alkupistettä: opastinta, vaihdetta, kulkutiepistettä tai liikennepaikan rajaa.',
    clickEnd: (start: string) =>
      `Alkupiste: ${start}. Napsauta kulkutien loppupistettä tai kulkutiepistettä, jonka kautta kulkutie kulkee.`,
    notFound: {
      noPath:
        'Näiden kohtien välillä ei ole kulkutietä (opastimen ohi kuljetaan vain sen suuntaan).',
      notRoutePoint:
        'Kulkutien alku- ja loppupiste on opastin, vaihde, kulkutiepiste tai liikennepaikan raja.',
      samePoint: 'Alku- ja loppupiste ovat sama kohta.',
    } as Record<string, string>,
    via: (points: string) => `kautta ${points}`,
    options: 'Yhtä hyvät kulkutiet',
    option: (n: number) => `Kulkutie ${n}`,
    tie: 'Nämä kulkutiet ovat yhtä hyviä. Valitse yksi; se näytetään kaaviossa.',
    summary: (turnouts: number, areas: string[]) =>
      `${turnouts} ${turnouts === 1 ? 'vaihde' : 'vaihdetta'}; alueet: ${areas.join(', ')}.`,
    startLevel1:
      'Kulkutiet alkavat tason 2 alueelta. Vaihda taso kohdassa Tasot, jos haluat käyttää kulkuteitä täällä.',
    levelNotAvailable:
      'Kulkutie kulkee alueen kautta, jonka taso ei ole vielä käytettävissä.',
    level1Warning: (areas: string) =>
      `Osa kulkutiestä on tason 1 alueella (${areas}), jossa kulkutielogiikkaa tai suojausta ei ole tarkoitus olla. Siellä se asetetaan tavalliseen tapaan.`,
    manualList: (turnouts: string) =>
      `Keskittämättömät vaihteet, käännä käsin: ${turnouts}.`,
    set: 'Aseta kulkutie',
    cancels: (routes: string) =>
      `Tämän kulkutien asettaminen purkaa kulkutiet ${routes} (niillä on yhteisiä raiteita tai vaihteita).`,
    crosses: (routes: string, at: string) =>
      `Kulkutie risteää kulkuteiden ${routes} kanssa kohdassa ${at}. Molemmat voi asettaa, mutta niillä kulkevat junat kohtaisivat siellä.`,
    crossQuestion: 'Asetetaanko kulkutie, vaikka se risteää toisen kanssa?',
    crossConfirm: 'Aseta silti',
    crossBack: 'Takaisin',
    save: 'Tallenna…',
    saveName: 'Nimi',
    saveConfirm: 'Tallenna kulkutie',
    saved: 'Tallennetut kulkutiet',
    show: 'Näytä',
    deleteSaved: 'Poista',
    states: {
      setting: 'Asetetaan… (vaihteet kääntyvät)',
      set: 'Asetettu',
      failed: (turnout: string) => `Ei asetettu: ${turnout} ei kääntynyt`,
      broken: (turnout: string) =>
        `Valvonta menetetty: ${turnout} kääntyi; opastimet Seis-opasteelle`,
    },
    manualToSet: (turnouts: string) => `Käännä käsin: ${turnouts}.`,
    release: 'Pura',
    cancelRoute: 'Pura',
    fromHere: 'Kulkutie alkaa tästä',
    endHere: 'Kulkutie päättyy tähän',
    viaHere: 'Kulkutie tämän kautta',
    followExit: 'Siirry toiseen päähän',
  },

  // Layout views: canvases with station frames and drawn lines.
  full: {
    title: 'Näkymä',
    newName: (n: number) => `Näkymä ${n}`,
    add: 'Näkymä',
    tabsLabel: 'Näkymät ja asemat',
    name: 'Nimi',
    remove: 'Poista näkymä',
    editHelp:
      'Näkymässä näkyvät asemat, joille piirrät kehyksen, ja niitä yhdistävät piirtämäsi viivat. Avaa näkymä omaan ikkunaansa painikkeella Uusi ikkuna, esimerkiksi yksi näkymä kullekin näytölle.',
    tools: 'Näkymän työkalut',
    select: 'Valitse',
    line: 'Viiva',
    frameFor: 'Kehys asemalle',
    selectHelp:
      'Siirrä kehystä vetämällä sitä tai sen otsikkoa, muuta kokoa vetämällä kulmasta. Avaa asema kaksoisnapsauttamalla sen otsikkoa.',
    frameHelp: 'Piirrä kehys vetämällä pohjalla. Asema sovitetaan sen sisään.',
    lineHelp:
      'Lisää pisteitä napsauttamalla; napsautus liikennepaikan rajan lähellä kiinnittää viivan siihen. Lopeta rajaan, napsauttamalla viimeistä pistettä uudelleen tai Enterillä. Backspace poistaa viimeisen pisteen.',
    station: 'Asema',
    rotation: (degrees: number) => `Kierto: ${degrees}°`,
    rotateLeft: 'Kierrä vasemmalle',
    rotateRight: 'Kierrä oikealle',
    openStation: 'Avaa asema',
    deleteFrame: 'Poista kehys',
    deleteLine: 'Poista viiva',
    lineTitle: 'Viiva',
    linePoints: (n: number) => `${n} ${n === 1 ? 'piste' : 'pistettä'}`,
    selectHint: 'Muuta kehystä tai viivaa napsauttamalla sitä.',
    empty:
      'Näkymä on tyhjä. Valitse asema kohdasta ”Kehys asemalle” ja piirrä sen kehys vetämällä pohjalla.',
    emptyOperate:
      'Näkymä on tyhjä. Siirry tilaan Muokkaa rataa ja piirrä siihen asemien kehykset.',
  },

  operate: {
    trainNumber: 'Junan numero tai nimi',
    setLabel: 'Näytä',
    clearLabel: 'Poista',
    feedbackMonitor: 'Vapaanaolon valvonta',
    feedbackShort: 'Ilmaisimet',
    noFeedbackSources:
      'Tälle radalle ei ole kytketty yhtään ilmaisinväylää (Muokkaa rataa → ei valintaa → Keskusyksikön asetukset).',
    feedbackSources: (list: string) => `Kuunnellaan: ${list}.`,
    input: 'Tulo',
    state: 'Tila',
    usedBy: 'Käytössä',
    notReported: 'Ei vielä ilmoitettu',
    notUsed: '—',
    areas: 'Automaatiotasot',
    areasShort: 'Tasot',
    areasHelp:
      'Taso 1: vaihteet käännetään ja opastimet asetetaan yksitellen. Taso 2: lisäksi kulkutiet. Tason vaihtaminen ei koskaan käännä vaihdetta eikä muuta opastetta.',
    stationDefault: 'koko asema',
    levelLater: (level: number) => `Taso ${level} (myöhemmin)`,
    levelBadge: (level: number) => `Taso ${level}`,
  },

  modes: {
    operate: 'Ohjaa',
    edit: 'Muokkaa rataa',
    editing: 'MUOKKAUS',
    readOnly: 'Vain luku: auki toisessa Leverissä',
    passwordTitle: 'Muokkaussalasana',
    passwordPrompt: 'Anna muokkaussalasana, jos haluat muuttaa rataa.',
    wrongPassword: 'Väärä salasana.',
    unlock: 'Muokkaa',
    cancel: 'Peruuta',
  },

  editor: {
    tools: {
      select: 'Valitse',
      track: 'Raide',
      turnoutLeft: 'Vasenkätinen vaihde',
      turnoutRight: 'Oikeakätinen vaihde',
      wye: 'Tasapuolinen vaihde',
      threeWay: 'Kaksoisvaihde (kolmitie)',
      crossing: 'Raideristeys',
      singleSlip: 'Yksipuolinen risteysvaihde',
      doubleSlip: 'Kaksipuolinen risteysvaihde',
      signal: 'Opastin',
      bufferStop: 'Raidepuskin',
      virtualPoint: 'Kulkutiepiste',
      connector: 'Liikennepaikan raja',
      accessory: 'Irrotusraide / lisälaite',
      label: 'Teksti',
      platform: 'Laituri',
    },
    toolHelp: {
      select:
        'Valitse napsauttamalla, lisää valintaan Shift+napsautuksella, siirrä vetämällä. Valitse alue vetämällä tyhjästä kohdasta.',
      track:
        'Aloita napsauttamalla, napsauta jokaisen kulman kohdalla ja lopeta napsauttamalla viimeistä pistettä uudelleen tai kaksoisnapsauttamalla.',
      place: 'Sijoita napsauttamalla. R kiertää ennen sijoittamista.',
    },
    undo: 'Kumoa',
    redo: 'Tee uudelleen',
    rotate: 'Kierrä (R)',
    delete: 'Poista',
    fit: 'Sovita näkymään',
    testMode: 'Testaa lähtöjä',
    testModeHelp:
      'Testitila: napsauta vaihdetta, opastinta tai lisälaitetta, niin sen asennot tai opasteet käydään läpi yksi kerrallaan. Komennot lähetetään radalle.',
    addView: 'Lisää asema',
    deleteView: 'Poista tämä asema',
    confirmDeleteView: (name: string) =>
      `Poistetaanko asema ”${name}” ja kaikki siihen piirretty?`,
    replaceTitle: 'Korvaa kohde',
    confirmReplace: (what: string) =>
      `Korvataanko ${what}? Sen nimi, osoitteet ja asetukset poistetaan. Kumoa (Ctrl+Z) tuo ne takaisin.`,
    replace: 'Korvaa',
    newViewName: 'Uusi asema',
    hints: {
      notOnTrack: 'Sijoita tämä raiteelle.',
      notAtTrackEnd: 'Sijoita tämä raiteen päähän.',
      notStraight: 'Raide voi kulkea vain suoraan tai 45°:n kulmassa.',
    },
    problems: 'Ongelmat',
    addresses: 'Osoitteet',
    showNotes: 'Näytä huomautukset',
    noProblems: 'Ongelmia ei löytynyt.',
    unsaved: 'Tallennetaan…',
    saved: 'Tallennettu',
    notSavedYet: 'Ei vielä tallennettu',
    changeNotSaved:
      'Muutosta ei voitu tehdä: se olisi vahingoittanut rataa. Mitään ei muutettu. (Lisätietoja kehittäjäkonsolissa.)',
    changeReadOnly:
      'Muutosta ei tallennettu: rata on auki vain luettavana (sitä muokataan muualla).',
    migrated: (version: number) => `Päivitetty muodosta ${version}`,
  },

  colorPicker: {
    none: 'Ei mitään',
    area: 'Kylläisyys ja kirkkaus',
    areaValue: (saturation: number, brightness: number) =>
      `Kylläisyys ${saturation} %, kirkkaus ${brightness} %`,
    hue: 'Sävy',
    hex: 'Hex',
    presets: 'Värit',
  },
  properties: {
    title: 'Ominaisuudet',
    nothingSelected: 'Ei valintaa.',
    selectedCount: (count: number) =>
      `${count} ${count === 1 ? 'kohde' : 'kohdetta'} valittu`,
    name: 'Nimi',
    area: 'Automaatioalue',
    areas: 'Automaatioalueet',
    areasHelp:
      'Jokainen asema on yksi alue. Lisää alueita aseman osille tai asemien väliselle linjalle ja valitse alue kohteen ominaisuuksista (tai usealle valitulle kohteelle kerralla).',
    areaName: 'Alueen nimi',
    areaLevel: 'Taso',
    addArea: 'Lisää alue',
    removeArea: 'Poista alue',
    newAreaName: 'Uusi alue',
    mixedAreas: 'Eri alueita',
    areaDefault: (name: string, level: number) =>
      `Aseman oletus (${name}, taso ${level})`,
    level: (level: number) => `Taso ${level}`,
    type: 'Tyyppi',
    rotate: 'Kierrä',
    reverse: 'Käännä suunta',
    side: 'Raiteen puoli',
    sideLeft: 'Vasen',
    sideRight: 'Oikea',
    control: 'Kytkentä',
    controlManual: 'Keskittämätön (asetetaan paikallisesti käsin)',
    controlDcc: 'DCC-lisälaiteosoitteet',
    controlExtended: 'Laajennettu lisälaite (laiteohjelmisto 1.40+)',
    address: (index: number) =>
      index === 0 ? 'Osoite' : `Osoite ${index + 1}`,
    addressCount: 'Osoitteiden määrä',
    decoder: (dccAddress: number, port: number) =>
      `Dekooderi ${dccAddress}, portti ${port + 1}`,
    invert: 'Vaihda lähdöt 1 ja 2 keskenään',
    pulse: 'Pulssin pituus (ms)',
    pulseDefault: (ms: number) => `Radan oletus (${ms} ms)`,
    outputMap: 'Lähdöt asennoittain',
    outputMapReset: 'Käytä oletuksia',
    output: (n: number) => `Lähtö ${n}`,
    extendedAddress: 'Laajennettu osoite',
    extendedValue: 'Arvo',
    test: 'Testaa',
    testHint: 'Lähettää komennon radalle.',
    positionFeedback: 'Asennon takaisinilmaisu (valinnainen)',
    signalType: 'Opastintyyppi',
    distantFor: 'Esiopastin pääopastimelle',
    none: 'Ei mitään',
    block: 'Raideosuus',
    newBlock: 'Uusi raideosuus',
    blockName: 'Raideosuuden nimi',
    feedbackInputs: 'Ilmaisimen tulot',
    addInput: 'Lisää tulo',
    removeInput: 'Poista',
    releaseDelay: 'Vapautumisviive (ms)',
    source: 'Lähde',
    module: 'Moduuli',
    input: 'Tulo',
    port: 'Portti',
    feedbackAddress: 'Osoite',
    role: 'Laji',
    roles: {
      uncoupler: 'Irrotusraide',
      light: 'Valo',
      other: 'Muu',
    } as Record<string, string>,
    buttonType: 'Painike',
    momentary: 'Hetkellinen (pulssi)',
    toggle: 'Päälle / pois',
    text: 'Teksti',
    size: 'Koko',
    sizes: {small: 'Pieni', normal: 'Normaali', large: 'Suuri'} as Record<
      string,
      string
    >,
    textColor: 'Tekstin väri',
    textColorDefault: 'Normaali',
    textColorPresets: {
      red: 'Punainen',
      orange: 'Oranssi',
      yellow: 'Keltainen',
      green: 'Vihreä',
      blue: 'Sininen',
      violet: 'Violetti',
      grey: 'Harmaa',
    } as Record<string, string>,
    width: 'Leveys',
    height: 'Korkeus',
    stationName: 'Aseman nimi',
    layoutName: 'Radan nimi',
    project: 'Rata',
    station: 'Asema',
    defaultLevel: 'Oletusautomaatiotaso',
    editPassword: 'Muokkaussalasana',
    setPassword: 'Aseta salasana',
    changePassword: 'Vaihda salasana',
    removePassword: 'Poista salasana',
    passwordSet: 'Muokkaussalasana on asetettu.',
    passwordNotSet: 'Ei muokkaussalasanaa.',
    newPassword: 'Uusi salasana',
    centralUnit: 'Keskusyksikön asetukset',
    centralUnitHelp:
      'Asetukset, jotka voivat vaihdella keskusyksiköstä toiseen (z21, Z21, DR5000). Muuta näitä, jos vaihteet kääntyvät väärin päin tai eivät lainkaan.',
    addressOffset: 'Osoitteen siirtymä',
    addressOffsetHelp: '0 = numerot kuten Rocon sovelluksessa.',
    straightOutput: 'Lähtö asennolle ”suora”',
    gap: 'Tauko lisälaitekomentojen välillä (ms)',
    commandMode: 'Vaihdekomennot',
    commandModePulse: 'Lever ajastaa jokaisen pulssin (toimii kaikkialla)',
    commandModeQueued: 'Keskusyksikön jonossa (laiteohjelmisto 1.24+)',
    confirmation: 'Vaihteen asento vahvistettu',
    confirmationReport: 'Vain kun keskusyksikkö ilmoittaa sen',
    confirmationAssume: 'Myös aikakatkaisun jälkeen ilman ilmoitusta',
    confirmTimeout: 'Aikakatkaisu (ms)',
    positionRefresh: 'Kysy vaihteiden asentoja (s välein)',
    positionRefreshHelp:
      '0 = pois. Keskusyksiköille, jotka eivät ilmoita muiden ohjelmien kääntämiä vaihteita (DR5000: WinDigipet USB:n kautta). Lever kysyy silloin näytöllä olevan aseman vaihteiden asennot näin usein ja heti, kun teet jotain.',
    feedbackSources: 'Käytetyt ilmaisinväylät',
    blockReleaseDelay: 'Raideosuuden vapautumisviiveen oletus (ms)',
    autoSignals: 'Aseta opastimet kulkuteiden varrella automaattisesti',
    pairedWith: 'Johtaa kohteeseen',
    notPaired: 'Ei linkitetty (viivaa ei piirretty)',
    unnamedExitAt: (arrow: string, x: number, y: number) =>
      `raja ${arrow} kohdassa ${x}, ${y}`,
    linkedElsewhere: 'linkitetty muualle',
    pairingHelp:
      'Linkitä tämä raja viivan toisessa päässä olevaan rajaan, toisella asemalla tai tällä samalla. Kulkutiet jatkuvat silloin sen läpi, ja ohjaustilassa rajan napsauttaminen avaa toisen pään.',
    restoreTurnouts: 'Palauta vaihteiden asennot käynnistettäessä',
    restoreTurnoutsHelp:
      'Kun Lever avaa tämän radan, se kääntää jokaisen keskitetyn vaihteen viimeksi vahvistettuun asentoon, yksi kerrallaan. Tiedossa ovat vain asennot, jotka tämä kone on nähnyt.',
  },

  validation: {
    severity: {error: 'Virhe', warning: 'Varoitus', info: 'Huomautus'},
    invalidTrackAngle: () => 'Raiteessa on mutka, joka ei ole 45° eikä 90°.',
    signalNotOnTrack: () => 'Opastin ei ole raiteella.',
    signalFacingAcrossTrack: () => 'Opastin ei osoita raiteensa suuntaan.',
    unknownSignalType: () => 'Opastintyyppi puuttuu.',
    duplicateAddress: (p: Record<string, string | number>) =>
      `Osoitetta ${p['address']} käyttää useampi kuin yksi kohde.`,
    missingAddress: (p: Record<string, string | number>) =>
      `Osoitteita tarvitaan ${p['required']}, annettu ${p['count']}.`,
    addressOutOfRange: () =>
      'Osoite on sallitun alueen ulkopuolella (tarkista osoitteen siirtymä).',
    openTrackEnd: () =>
      'Avoin raiteen pää (lisää raidepuskin, liikennepaikan raja tai lisää raidetta).',
    junctionWithoutTurnout: () => 'Raiteet kohtaavat ilman vaihdetta.',
    trackThroughTurnout: () => 'Raide kulkee vaihteen keskeltä.',
    overlappingTrack: () => 'Kaksi raidetta on päällekkäin.',
    endMarkerNotAtTrackEnd: () =>
      'Raidepuskin tai liikennepaikan raja ei ole raiteen päässä.',
    feedbackInputConflict: (p: Record<string, string | number>) =>
      `Ilmaisimen tuloa ${p['input']} käyttää useampi kuin yksi raideosuus.`,
    invalidDistantSignal: () =>
      'Esiopastimen asetus ei vastaa mitään pääopastinta.',
    manualTurnout: () => 'Vaihde on keskittämätön (käännetään käsin).',
    trackWithoutFeedback: (p: Record<string, string | number>) =>
      `${p['count']} ${p['count'] === 1 ? 'raidepala' : 'raidepalaa'} ilman vapaanaolon valvontaa.`,
    unpairedConnector: () =>
      'Liikennepaikan rajaa ei ole linkitetty toiseen asemaan.',
    brokenConnectorPair: () =>
      'Liikennepaikan raja on linkitetty rajaan, joka on poistettu tai linkitetty muualle. Valitse sen pari uudelleen.',
    tracksCrossWithoutConnection: () =>
      'Raiteet risteävät ilman yhteyttä (ylikulku).',
  },

  addressTable: {
    station: 'Asema',
    name: 'Nimi',
    kind: 'Laji',
    address: 'Osoite',
    decoder: 'Dekooderi / portti',
    detail: 'Lisätieto',
    conflict: 'Käytössä kahdesti',
    allStations: 'Kaikki asemat',
    allKinds: 'Kaikki lajit',
    search: 'Hae',
    empty: 'Osoitteita ei ole vielä käytetty.',
    types: {
      accessory: 'Lisälaite',
      extended: 'Laajennettu',
      feedback: 'Ilmaisin',
    },
  },

  kinds: {
    track: 'Raide',
    turnout: 'Vaihde',
    signal: 'Opastin',
    bufferStop: 'Raidepuskin',
    virtualPoint: 'Kulkutiepiste',
    connector: 'Liikennepaikan raja',
    accessory: 'Lisälaite',
    label: 'Teksti',
    platform: 'Laituri',
    block: 'Raideosuus',
  } as Record<string, string>,

  turnoutTypes: {
    left: 'Vasenkätinen vaihde',
    right: 'Oikeakätinen vaihde',
    wye: 'Tasapuolinen vaihde',
    threeWay: 'Kaksoisvaihde (kolmitie)',
    crossing: 'Raideristeys',
    singleSlip: 'Yksipuolinen risteysvaihde',
    doubleSlip: 'Kaksipuolinen risteysvaihde',
  } as Record<string, string>,

  positions: {
    straight: 'Suora',
    diverging: 'Poikkeava',
    left: 'Vasen',
    right: 'Oikea',
  } as Record<string, string>,

  test: {
    sent: 'lähetetty',
    manual: 'keskittämätön: aseta käsin',
    on: 'päällä',
    off: 'pois',
    incomplete: {
      missingAddress: 'osoitetta ei ole asetettu',
      addressOutOfRange:
        'osoite sallitun alueen ulkopuolella (tarkista osoitteen siirtymä)',
      unknownPosition: 'tuntematon opastintyyppi tai asento',
      noOutputs: 'tälle asennolle ei ole asetettu lähtöjä',
      noExtendedValue: 'laajennetun lisälaitteen arvoa ei ole asetettu',
    },
  },

  signalTypes: {
    main2: 'Pääopastin, 2 opastetta',
    main3: 'Pääopastin, 3 opastetta',
    distant: 'Esiopastin',
    shunting: 'Raideopastin',
    aspects: {
      stop: 'Seis',
      proceed: 'Aja',
      reduced: 'Aja 35',
      expectStop: 'Odota seis',
      expectProceed: 'Odota aja',
      shuntStop: 'Seis',
      shuntAllowed: 'Ajo sallittu',
    },
  },

  notices: {
    extAccessoryUnsupported: () =>
      'Keskusyksikön laiteohjelmisto on liian vanha laajennetuille lisälaitteille (vaatii version 1.40). Mitään ei lähetetty.',
    refused: (name: string, reason?: string) =>
      reason === 'signalNeedsRoute'
        ? `${name}: tasolla 2 opastimet asetetaan vain kulkuteiden mukana. Napsauta sitä ja valitse ”Kulkutie alkaa tästä”.`
        : `${name}: ei mahdollista tällä automaatiotasolla.`,
    incomplete: (name: string, reason: string) =>
      `${name}: ${(fi.test.incomplete as Record<string, string>)[reason] ?? reason}. Mitään ei lähetetty.`,
    failed: (name: string) =>
      `${name}: keskusyksikkö ei vahvistanut muutosta, ei myöskään toisella yrityksellä. Tarkista vaihde tai opastin.`,
    labelNeedsFeedback: (name: string) =>
      `${name}: junan numeron voi näyttää vain raiteella, jolla on vapaanaolon valvonta.`,
    routeRefused: (reason: string) =>
      ({
        noRoute: 'Näiden kohtien välillä ei ole kulkutietä.',
        changed:
          'Rata on muuttunut kulkutien näyttämisen jälkeen. Valitse kulkutie uudelleen.',
        needsLevel2:
          'Kulkutiet alkavat tason 2 alueelta. Vaihda alueen taso kohdassa Tasot.',
        levelNotAvailable:
          'Kulkutie kulkee alueen kautta, jonka taso ei ole vielä käytettävissä.',
        crossing:
          'Kulkutie risteää toisen kulkutien kanssa. Näytä se uudelleen ja vahvista risteäminen.',
      })[reason] ?? 'Kulkutietä ei voitu asettaa.',
    routeSet: (manual: string[]) =>
      manual.length > 0
        ? `Kulkutie asetettu. Käännä käsin: ${manual.join(', ')}.`
        : 'Kulkutie asetettu.',
    routeFailed: (turnout: string) =>
      `Kulkutietä ei asetettu: ${turnout} ei kääntynyt. Tarkista se ja pura kulkutie tai yritä uudelleen.`,
    routeBroken: (turnout: string) =>
      `Kulkutien valvonta menetettiin: ${turnout} kääntyi. Sen opastimet palautettiin Seis-opasteelle.`,
    routeReleasedMoved: (turnout: string) =>
      `Kulkutie purettiin: ${turnout} havaittiin toisessa asennossa. Sen opastimet palautettiin Seis-opasteelle.`,
    routeCancelled: (from: string, to: string) =>
      `Kulkutie ${from} → ${to} purettiin: uusi kulkutie on ristiriidassa sen kanssa. Sen opastimet palautettiin Seis-opasteelle.`,
    routeUndone: (skipped: string[], manualBack: string[]) =>
      [
        'Viimeisin kulkutie kumottu.',
        skipped.length > 0
          ? `Jätettiin ennalleen (käännetty sen jälkeen): ${skipped.join(', ')}.`
          : '',
        manualBack.length > 0
          ? `Käännä takaisin käsin: ${manualBack.join(', ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    dismiss: 'Sulje',
  },

  // Developer tools: test accessories and feedback without a layout.
  developer: {
    title: 'Lisälaitteiden ja ilmaisimien testi',
    short: 'Lisälaitetesti',
    turnoutNumber: 'Vaihteen numero (kuten Rocon sovelluksessa)',
    output1: 'Lähtö 1',
    output2: 'Lähtö 2',
    askPosition: 'Kysy asento',
    dccAddress: (dccAddress: number, port: number) =>
      `DCC-dekooderin osoite ${dccAddress}, portti ${port + 1}`,
    queue: (count: number) =>
      count === 0
        ? 'Ei odottavia lisälaitekomentoja'
        : `${count} ${count === 1 ? 'lisälaitekomento odottaa' : 'lisälaitekomentoa odottaa'}`,
    accessoriesHeading: 'Havaitut lisälaitteet',
    noAccessories:
      'Ei vielä yhtään. Käännä jokin tästä tai toisesta sovelluksesta.',
    feedbackHeading: 'Ilmaisimet',
    noFeedback: 'Ilmaisimien tuloja ei ole ilmoitettu.',
    feedbackSources: {
      rbus: 'R-Bus',
      loconet: 'LocoNet-ilmaisimet',
      can: 'CAN-ilmaisimet',
    },
    occupiedOnly: 'Varatut tulot',
  },

  accessoryState: {
    unknown: 'Tuntematon',
    notSwitched: 'Ei käännetty virran kytkemisen jälkeen',
    output1: 'Lähtö 1',
    output2: 'Lähtö 2',
    invalid: 'Virheellinen ilmoitus',
    waiting: (output: number) => `Odotetaan lähtöä ${output}…`,
  },

  feedback: {
    occupied: 'Varattu',
    free: 'Vapaa',
    overload: (level: number) => `Ylikuorma ${level}`,
    input: (key: string) => {
      const [source, a, b] = key.split(':');
      switch (source) {
        case 'rbus':
          return `R-Bus-moduuli ${a}, tulo ${b}`;
        case 'loconet':
          return `LocoNet-osoite ${a}`;
        case 'can':
          return `CAN-moduuli ${a}, portti ${b}`;
        default:
          return key;
      }
    },
    locos: (addresses: number[]) => `Kalustoyksiköt: ${addresses.join(', ')}`,
  },
};

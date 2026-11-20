# Leverin asentaminen

Lever toimii Windows 10:ssä ja Windows 11:ssä (64-bittinen). Levytilaa tarvitaan noin 350 Mt,
eikä asentamiseen tarvita järjestelmänvalvojan oikeuksia.

Leverin omat painikkeet ja valikot ovat englanniksi. Tässä ohjeessa ne on kirjoitettu
**lihavoituna** juuri niin kuin ne näkyvät ruudulla.

## 1. Asennusohjelma vai siirrettävä versio?

Molemmat löytyvät [Releases](https://github.com/MatteZ02/lever/releases)-sivulta. Ota uusin
julkaisu.

| Tiedosto                          | Valitse tämä, kun                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Lever-<versio>-setup-x64.exe`    | **Lever jää tälle koneelle**, esimerkiksi kerhon ohjauspöydän koneelle. Lever tulee Käynnistä-valikkoon ja työpöydälle, ja sen voi poistaa Windowsin asetuksista kohdasta Sovellukset. |
| `Lever-<versio>-portable-x64.zip` | Et voi tai halua asentaa mitään, esimerkiksi lainakoneella, tai haluat käyttää Leveriä muistitikulta.                                                                                  |

Kyse on samasta ohjelmasta. Asetukset tallentuvat erikseen, joten versiosta toiseen voi vaihtaa.

## 2. Asentaminen

**Asennusohjelma:** kaksoisnapsauta `Lever-<versio>-setup-x64.exe`, valitse kansio (tai pidä
ehdotettu) ja napsauta **Install**. Lever käynnistyy työpöydän kuvakkeesta tai Käynnistä-valikosta.

**Siirrettävä versio:** napsauta zip-tiedostoa hiiren oikealla painikkeella, valitse **Pura
kaikki…** ja valitse kansio, esimerkiksi `Tiedostot\Lever`. Avaa kansio ja kaksoisnapsauta
`Lever.exe`.

### "Windows suojasi tietokonettasi"

Leveriä ei ole allekirjoitettu maksullisella varmenteella, joten ensimmäisellä käynnistyskerralla
Windows saattaa näyttää sinisen ikkunan: **Windows suojasi tietokonettasi**.

1. Napsauta **Lisätietoja**.
2. Tarkista, että kohdassa Sovellus lukee **Lever…**, ja napsauta **Suorita silti**.

Windows kysyy tätä vain kerran. Jos **Suorita silti** -painiketta ei ole, koneen ylläpitäjä on
estänyt tuntemattomat ohjelmat. Kysy silloin koneen ylläpitäjältä.

### "Windows Defenderin palomuuri on estänyt joitakin tämän sovelluksen ominaisuuksia"

Ensimmäisellä käynnistyskerralla Windows saattaa kysyä, saako Lever käyttää verkkoa. Lever
tarvitsee verkkoa keskusyksikön kanssa keskustelemiseen.

1. Rastita **Yksityiset verkot**.
2. Napsauta **Salli käyttö**.

Jos painoit vahingossa **Peruuta**, katso kohta _Ongelmatilanteet_ alempana.

## 3. Koneen liittäminen radan verkkoon

Lever keskustelee keskusyksikön (DR5000, Z21 tai z21 start) kanssa radan omassa verkossa.

- Liitä kone **samaan verkkoon kuin keskusyksikkö**: radan wlan-verkkoon tai verkkokaapelilla radan
  reitittimeen. Kerhon ohjauspöydän koneet on jo valmiiksi liitetty.
- Jos Windows kysyy, onko verkko julkinen vai yksityinen, valitse **Yksityinen**.

## 4. Keskusyksikön osoite

Leverin saa suomenkieliseksi: **Settings** → **Language** → **Suomi**, jolloin ikkunat latautuvat
uudelleen suomeksi. Tämä ohje käyttää englanninkielisiä nimiä (suomeksi **Asetukset**, **Kieli**
jne.).

1. Käynnistä Lever.
2. Napsauta oikeasta yläkulmasta **Settings**.
3. Kirjoita kohtaan **Central unit** keskusyksikön **IP address**. Tehtaalta tulleen keskusyksikön
   osoite on `192.168.0.111`, ja se on myös kerhon DR5000:n osoite. Jätä **Port**-kenttään `21105`.
4. Napsauta **Connect**.

Kun yhteys toimii, ikkunan vasemmassa yläkulmassa lukee **Connected** ja keskusyksikön tyyppi.
Lever muistaa osoitteen seuraavalla kerralla.

## 5. Ratapiirroksen avaaminen

Ratapiirrokset ovat ratatiedostossa (`.lever`).

1. Valitse **File → Open…** ja valitse ratatiedosto. Kerholla se on joko saamasi tiedosto tai
   mallitiedosto `alppirata.lever`.
2. Lever avaa tiedoston, ja seuraavalla kerralla se avautuu itsestään.

Lever tallentaa muutokset itse. Jos sama ratatiedosto on jo muokattavana toisessa Leverissä
(samalla tai toisella koneella), se avautuu vain luettavaksi (**read-only**). Junia voi silti
ajaa ja vaihteita kääntää.

Lever käynnistyy käyttötilaan (**Operate**). Vaihde kääntyy napsauttamalla, opastin asetetaan
napsauttamalla, ja **Esc** pysäyttää kaiken (**STOP**) milloin tahansa. Loput löytyy
[käyttöohjeesta](user-guide.md) (englanniksi).

## Ongelmatilanteet

| Mitä näkyy                                 | Mitä tehdä                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connection lost, retrying…** eikä muutu  | Onko keskusyksikkö päällä? Onko kone radan verkossa (wlan tai kaapeli)? Onko **Settings**-kohdan IP-osoite oikein? Saako jokin toinen sovellus (Throttle, Rocon sovellus) yhteyden keskusyksikköön?                                                                                                                                          |
| Yhteys ei synny, vaikka verkko on oikea    | Windowsin palomuuri voi estää Leverin. Avaa **Windowsin suojaus → Palomuuri ja verkon suojaus → Salli sovellus palomuurin läpi**, napsauta **Muuta asetuksia**, etsi listasta **Lever** ja rastita **Yksityinen**. Jos Leveriä ei ole listassa, napsauta **Salli toinen sovellus…** ja valitse `Lever.exe`. Lever käyttää UDP-porttia 21105. |
| Yhteys on, mutta radalla ei tapahdu mitään | Onko ajovirta päällä (painike ylhäällä)? Onko joku painanut STOPia (**Resume** jatkaa)? Jos vaihteet kääntyvät väärin päin tai eivät ollenkaan, se korjataan ratatiedoston keskusyksikköasetuksista. Kysy radan ylläpitäjältä.                                                                                                               |
| Vaihteessa näkyy katkoviiva tai **?**      | Lever ei vielä tiedä, missä asennossa vaihde todella on (esimerkiksi keskusyksikön käynnistyksen jälkeen). Käännä vaihdetta kerran, niin asento näkyy.                                                                                                                                                                                       |
| "Opened read-only"                         | Ratatiedostoa muokataan toisessa Leverissä. Sulje se siellä, jos haluat muokata tällä koneella.                                                                                                                                                                                                                                              |
| Näyttöä on vaikea lukea                    | **Settings → Colours**: vaalea, tumma tai sama kuin Windowsissa. Ctrl ja plus tai miinus suurentaa tai pienentää kaikkea.                                                                                                                                                                                                                    |

Lever säilyttää asetuksensa kansiossa `%APPDATA%\Lever`. Kansion poistaminen palauttaa asetukset
alkutilaan. Ratatiedostot ovat muualla, eikä poistaminen koske niihin.

## Päivittäminen ja poistaminen

Automaattisia päivityksiä ei ole. Päivitä lataamalla uusi julkaisu ja asentamalla se vanhan päälle
(asennusohjelma) tai purkamalla se vanhan kansion päälle (siirrettävä versio). Poistaminen:
Windowsin asetukset → Sovellukset → Lever → Poista asennus (asennusohjelma), tai poista kansio
(siirrettävä versio).

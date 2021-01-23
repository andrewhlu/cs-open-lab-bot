function parseMessage(content) {
    let result = {};

    // First, parse the name
    const nameDelimiters = [",", ";", "class of", "c/o"];
    for(let i = 0; i < nameDelimiters.length; i++) {
        if(content.toLowerCase().indexOf(nameDelimiters[i]) > 0) {
            result.name = content.substring(0, content.toLowerCase().indexOf(nameDelimiters[i])).trim();
            content = content.substring(content.toLowerCase().indexOf(nameDelimiters[i]) + 1);
            break;
        }
    }

    if(!result.name) {
        return null;
    }

    // Next, parse the class
    let regexResult = content.match(/\d{2,4}/g);

    if(!regexResult || regexResult.length === 0) {
        return null;
    }
    else {
        result.year = regexResult[0] % 2000 + 2000;
        content = content.substring(content.search(/\d{2,4}/g) + Math.ceil(Math.log10(regexResult[0])) + 1);
    }

    // Next, parse the bands
    const bands = [
        {
            match: "cb",
            band: "Concert Band",
        },
        {
            match: "concert",
            band: "Concert Band",
        },
        {
            match: "sb",
            band: "Symphonic Band",
        },
        {
            match: "symph",
            band: "Symphonic Band",
        },
        {
            match: "we",
            band: "Wind Ensemble",
        },
        {
            match: "wind",
            band: "Wind Ensemble",
        },
        {
            match: "jb",
            band: "Jazz Band",
        },
        {
            match: "jazz",
            band: "Jazz Band",
        },
    ];

    result.bands = [];

    for(let i = 0; i < bands.length; i++) {
        if(content.toLowerCase().indexOf(bands[i].match) > 0) {
            result.bands.push(bands[i].band);
            content = content.replace(content.substr(content.toLowerCase().indexOf(bands[i].match), bands[i].match.length + 1), "");
        }
    }

    if(!result.bands.length === 0) {
        return null;
    }

    // Last, parse the instruments
    const instruments = [
        {
            match: "bass clari",
            instrument: "Bass Clarinet",
        },
        {
            match: "bass guitar",
            instrument: "Bass Guitar",
        },
        {
            match: "flute",
            instrument: "Flute",
        },
        {
            match: "picc",
            instrument: "Flute",
        },
        {
            match: "clari",
            instrument: "Clarinet",
        },
        {
            match: "obo",
            instrument: "Oboe",
        },
        {
            match: "alto",
            instrument: "Alto Sax",
        },
        {
            match: "tenor",
            instrument: "Tenor Sax",
        },
        {
            match: "bari",
            instrument: "Bari Sax",
        },
        {
            match: "bassoon",
            instrument: "Bassoon",
        },
        {
            match: "tuba",
            instrument: "Tuba",
        },
        {
            match: "trombone",
            instrument: "Trombone",
        },
        {
            match: "euphonium",
            instrument: "Euphonium",
        },
        {
            match: "trumpet",
            instrument: "Trumpet",
        },
        {
            match: "perc",
            instrument: "Percussion",
        },
        {
            match: "guitar",
            instrument: "Guitar",
        },
        {
            match: "pian",
            instrument: "Piano",
        },
    ];

    result.instruments = [];

    for(let i = 0; i < instruments.length; i++) {
        if(content.toLowerCase().indexOf(instruments[i].match) > 0) {
            result.instruments.push(instruments[i].instrument);
            content = content.replace(content.substr(content.toLowerCase().indexOf(instruments[i].match), instruments[i].match.length + 1), "");
        }
    }

    if(!result.instruments.length === 0) {
        return null;
    }

    return result;
}

function assignRoles(msg, user) {
    const serverRoles = msg.guild.roles.cache;

    let rolesToAdd = [];

    // Assign role for year
    const yearRole = serverRoles.find((role) =>  role.name.indexOf(user.year) >= 0 );
    if(yearRole) {
        rolesToAdd.push(yearRole.id);
    }

    // Assign roles for bands
    for(let i = 0; i < user.bands.length; i++) {
        const bandRole = serverRoles.find((role) => role.name.indexOf(user.bands[i]) >= 0 );
        if(bandRole) {
            rolesToAdd.push(bandRole.id);
        }
    }

    // Assign roles for instruments
    for(let i = 0; i < user.instruments.length; i++) {
        const instrumentRole = serverRoles.find((role) => role.name.indexOf(user.instruments[i]) >= 0 );
        if(instrumentRole) {
            rolesToAdd.push(instrumentRole.id);
        }
    }

    msg.member.edit({
        nick: user.name,
        roles: rolesToAdd,
    }).catch((error) => {
        console.log(error);
    });
}
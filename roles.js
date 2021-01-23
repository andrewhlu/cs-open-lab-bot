import dotenv from 'dotenv';
import { openLabBot } from './index.js';

dotenv.config();

const rolesChannelId = process.env.ROLES_CHANNEL;
const rolesMessageId = process.env.ROLES_MESSAGE_ID;

let rolesChannel;
let rolesMessage;

const reactionsToRoles = {
    "🔴": "CMPSC 16",
    "🟡": "CMPSC 24",
    "🟢": "CMPSC 32",
    "🔵": "CMPSC 156"
};

export async function initRoles() {
    rolesChannel = await openLabBot.channels.fetch(rolesChannelId);
    rolesMessage = await rolesChannel.messages.fetch(rolesMessageId);
}

export async function addReactionRole(reaction, user) {
    const roleToAdd = reactionsToRoles[reaction.emoji.name];

    if (!roleToAdd) {
        // Invalid reaction, do nothing
        return;
    }

    const role = reaction.message.guild.roles.cache.find(role => role.name === roleToAdd);

    if (!role) {
        // Unable to find role
        const errorMessage = await rolesChannel.send(`an error occurred - we were unable to get this role!`, {
            reply: user
        });
        return errorMessage.delete({
            timeout: 15000
        });
    }

    // Add role to user
    const guildMember = await reaction.message.guild.members.fetch(user);

    return guildMember.roles.add(role);
}

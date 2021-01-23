import dotenv from 'dotenv';
import { Client, Permissions } from 'discord.js';
import { openLabBot } from './index.js';

dotenv.config();

const helpQueueCategoryId = process.env.HELP_QUEUE_CATEGORY_ID;
const privateChannelsCategoryId = process.env.PRIVATE_CHANNELS_CATEGORY_ID;
const botChannelId = process.env.BOT_CHANNEL_ID;

// Create Channel using the format:
// !create <text/voice> <channel name (no spaces)> <roles/members to invite (optional)>
export async function createChannel(msg) {
    const splitMsg = msg.content.split(" ");
    console.log(splitMsg);

    // Check if we have enough arguments to make the channel
    if (splitMsg.length < 3 || splitMsg[1].match(/<@.+>/g) !== null) {
        msg.reply("you didn't pass enough parameters to create a channel. The usage is as follows:\n" +
                "`!create <text/voice> <channel name (no spaces)> <roles/members to invite (optional)>`");
    } else if (splitMsg[1].toLowerCase() !== "text" && splitMsg[1].toLowerCase() !== "voice") {
        msg.reply(`I didn't understand the channel type, \`${splitMsg[1]}\`. Please specify \`text\` or \`voice\`. The usage ` +
                "is as follows:\n`!create <text/voice> <channel name (no spaces)> <roles/members to invite (optional)>`");
    } else {
        const newChannel = await msg.guild.channels.create(splitMsg[2], {
            type: splitMsg[1].toLowerCase(),
            parent: privateChannelsCategoryId,
            permissionOverwrites: buildPermissionOverwrites(splitMsg, msg.author.id, msg.guild.roles.everyone.id)
        });

        if (newChannel.type === "text") {
            let content = `welcome to your new channel, <#${newChannel.id}>!\n To invite people to this channel, ` + 
                    `use the \`!invite\` command in <#${botChannelId}>.`;
            newChannel.send(content, {
                reply: msg.author
            });
        }
    }
}

// Invite users to a text channel:
// !invite <channel mention> <roles/users to invite>
export async function inviteToChannel(msg) {
    const splitMsg = msg.content.split(" ");
    console.log(splitMsg);

    if (splitMsg.length < 3) {
        msg.reply("you didn't pass enough parameters to invite members to a channel. The usage is as follows:\n" +
                "`!invite <text channel mention> <roles/members to invite>`");
    } else if (splitMsg[1].match(/<@\d+>/g) === null && splitMsg[2].match(/<@.\d+>/g) === null) {
        msg.reply("I couldn't understand your inputs. The usage is as follows:\n" +
                "`!invite <text channel mention> <roles/members to invite>`");
    } else {
        const channelId = splitMsg[1].match(/\d+/g)[0];
        const channel = await openLabBot.channels.fetch(channelId);

        if (channel.parentID !== privateChannelsCategoryId && channel.parentID !== helpQueueCategoryId) {
            return msg.reply("I can only invite members to private and help request channels.");
        }

        splitMsg.forEach(user => {
            if (user.match(/<@.+>/g) !== null) {
                channel.permissionOverwrites.set(user.replace(/\D/g, ""), {
                    id: user.replace(/\D/g, ""),
                    allow: new Permissions(379968)
                });
            }
        });

        channel.edit({
            permissionOverwrites: channel.permissionOverwrites
        });

        if (channel.type === "text") {
            channel.send("your roles/members have been added to this channel!", {
                reply: msg.author
            });
        }
    }
}

const buildPermissionOverwrites = (splitMsg, userId, everyoneId) => {
    let permissions = [{
        // Deny @everyone - this makes this a private channel
        id: everyoneId,
        deny: new Permissions(379968)
    },
    {
        // Allow the bot
        id: openLabBot.user.id,
        allow: new Permissions(486464)
    },
    {
        // Allow the user that created the channel
        id: userId,
        allow: new Permissions(379968)
    }];
    
    // Allow any other roles / users that were mentioned
    splitMsg.forEach(user => {
        if (user.match(/<@.+>/g) !== null) {
            permissions.push({
                id: user.replace(/\D/g, ""),
                allow: new Permissions(379968)
            });
        }
    });

    console.log(permissions);
    return permissions;
}

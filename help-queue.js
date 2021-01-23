import dotenv from 'dotenv';
import { MessageEmbed, Permissions } from 'discord.js';
import mongodb from "mongodb";
import { openLabBot } from './index.js';
import { initDatabase } from './mongodb.js';

const { ObjectId } = mongodb;
dotenv.config();

const maxTitleLength = 100;
const maxDescriptionLength = 400;

const helpQueueCategoryId = process.env.HELP_QUEUE_CATEGORY_ID;
const helpQueueChannelId = process.env.HELP_QUEUE_CHANNEL_ID;
const pastHelpRequestsChannelId = process.env.PAST_HELP_REQUESTS_CHANNEL_ID;
const botChannelId = process.env.BOT_CHANNEL_ID;

const unclaimedImageURL = "https://cs-open-lab.andrewhlu.com/unclaimed.png";
const canceledImageURL = "https://cs-open-lab.andrewhlu.com/canceled.png";

const statusColors = {
    "draft": "#202225",
    "unclaimed": "#55acee",
    "claimed": "#fdcb58",
    "completed": "#78b259",
    "canceled": "#dd2e44"
}

let helpQueueChannel;
let pastHelpRequestsChannel;
let dbClient;
let dbRequests;

export async function initHelpQueue() {
    helpQueueChannel = await openLabBot.channels.fetch(helpQueueChannelId);
    pastHelpRequestsChannel = await openLabBot.channels.fetch(pastHelpRequestsChannelId);
    await helpQueueChannel.messages.fetch();

    dbClient = await initDatabase();
    dbRequests = dbClient.collection("help-requests");
}

export async function createNewHelpRequest(msg) {
    // First, check for existing active requests
    const activeRequest = await getActiveRequestForUser(msg.author.id);

    if (activeRequest === null) {
        // Create help request channel
        const channel = await msg.guild.channels.create("new-help-request", {
            type: "text",
            parent: helpQueueCategoryId,
            permissionOverwrites: buildPermissionOverwrites(msg.author.id, msg.guild.roles.everyone.id)
        });
        
        // Store new help request in DB
        await createNewRequestDb(msg.author.id, channel.id);

        let content = `welcome to your new help request! I need a few details from you so we can build and publish your request on the help queue.\n\n**First, what class is this help request for?** Enter a class number in the format \`CMPSC XXX\`.`;
        channel.send(content, {
            reply: msg.author
        });
    } else {
        // A help request is already active for this user, reply with an error
        msg.reply("you can only have one active help request at a time. Please finish or cancel your existing help request before starting a new one.");
    }
}

export async function buildHelpRequest(msg) {
    const requestChannel = msg.channel;
    let request = await getRequestForChannel(requestChannel.id);

    if (request === null) {
        return msg.reply(`I wasn't able to find a request for this channel (perhaps your request got deleted by mistake). Please try creating a new request by using the \`!hr\` command in <#${botChannelId}>.`);
    } else if (request.status === "draft") {
        // We only want to parse the message if we're in the middle of building it
        switch (request.creationStage) {
            case 1: {
                // Extract class name (must be "CMPSC XX or CS XX")
                let classNameArr = msg.content.toUpperCase().match(/(CMPSC|CS)\s*\d{1,3}[a-zA-Z]{0,2}/g);

                if (classNameArr === null) {
                    return msg.reply("I didn't understand this class name. **What class is this request for?** Please enter it in the format `CMPSC XXX`.");
                }

                // Replace "CS" with "CMPSC" if present, insert space after course subject if not present, then remove unnecessary whitespace
                let className = classNameArr[0].replace(/CS/g, "CMPSC").replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/\s+/g, " ");

                // Check if this class uses this CS Open Lab server (check for a corresponding role)
                if (!msg.guild.roles.cache.find(role => role.name === className)) {
                    return msg.reply(`it looks like the class you entered, ${className}, doesn't use this CS Open Lab server yet. Please use your class' designated office hours method(s) to request help, or specify a different class number.`);
                }

                // Save class and ask for title
                await addClassName(request._id, className);
                await updateRequestCreationStage(request._id, 2);
                return msg.reply(`I'll create this request for ${className}.\n\n**Next, what should I title your help request?** Provide a few words to describe your request (no more than ${maxTitleLength} characters).`);
            }
            case 2: {
                let title = msg.content.replace(/([\t\n\r]|\s+)/g, " ");

                if (title.length > maxTitleLength) {
                    return msg.reply(`this title is too long. Please keep your request title shorter than ${maxTitleLength} characters.`);
                }
                
                // Save title and ask for description
                await addTitle(request._id, title);
                await updateRequestCreationStage(request._id, 3);
                return msg.reply(`I'll create this request with title \`${title}\`.\n\n**Finally, can you provide a short description of your request?** Provide a few sentences to describe your request (no more than ${maxDescriptionLength} characters).`);
            }
            case 3: {
                let description = msg.content.replace(/([\t\n\r]|\s+)/g, " ");

                if (description.length > maxDescriptionLength) {
                    return msg.reply(`this description is too long. Please keep your request title shorter than ${maxDescriptionLength} characters.`);
                }
                
                // Save description and ask for confirmation
                await addDescription(request._id, description);
                request.description = description;
                await updateRequestCreationStage(request._id, 4);
                return msg.reply(`here's your help request.\n\n**Ready to submit?** Reply with \`yes\` to submit or \`no\` to start over.`, {
                    embed: await buildEmbedObject(request)
                });
            }
            case 4: {
                let answer = msg.content.toLowerCase().match(/yes|no/g);

                if (answer !== null && answer[0] === "no") {
                    // Start over
                    await updateRequestCreationStage(request._id, 1);
                    return msg.reply("let's start over from step one. **What class is this help request for?** Enter a class number in the format \`CMPSC XXX\`");
                } else if (answer !== null && answer[0] === "yes") {
                    request.status = "unclaimed";
                    request.time = Date.now();

                    const helpQueueMessage = await helpQueueChannel.send(`New Help Request from <@!${request.author}>`, {
                        embed: await buildEmbedObject(request)
                    });

                    // Publish request
                    await publishRequest(request._id, helpQueueMessage.id);

                    return msg.reply("I've published your help request.", {
                        embed: await buildEmbedObject(request)
                    });
                } else {
                    return msg.reply("I didn't understand your answer. **Is this request ready to submit?** Reply with `yes` or `no`.");
                }
            }
            default: {
                return requestChannel.send("Oops! An error occurred in the bot.");
            }
        }
    }
}

export async function addReactionToHelpRequest(reaction, user) {
    let request = await getRequestForMessage(reaction.message.id);

    if (request === null) {
        const errorMessageText = "I wasn't able to find the help request (perhaps it was deleted). Please try again!";
        const errorMessage = await helpQueueChannel.send(errorMessageText, {
            reply: user
        });
        return errorMessage.delete({
            timeout: 15000
        });
    }

    switch (reaction.emoji.name) {
        case "🔴": {
            // Cancel request
            await cancelRequest(request._id, user.id);
            request.status = "canceled";
            request.time = Date.now();
            request.canceler = user.id;

            // Send canceled help request to past channel
            pastHelpRequestsChannel.send("", {
                embed: await buildEmbedObject(request)
            });

            // Delete the message in the help queue
            reaction.message.delete();

            // Post message in help queue channel
            const requestChannel = await openLabBot.channels.fetch(request.channel);
            return requestChannel.send(`<@!${user.id}> canceled this request!`, {
                embed: await buildEmbedObject(request)
            });
        }
        case "🟡": {
            const requestChannel = await openLabBot.channels.fetch(request.channel);

            if (request.author === user.id) {
                const errorMessage = await helpQueueChannel.send(`you can't claim your own request!`, {
                    reply: user
                });
                errorMessage.delete({
                    timeout: 15000
                });
            } else if (!request.mentors.includes(user.id)) {
                // Claim request
                await claimRequest(request._id, user.id);
                request.status = "claimed";
                request.time = Date.now();
                request.mentors.push(user.id);

                // Edit help queue message to reflect new mentor
                const requestMessage = await helpQueueChannel.messages.fetch(request.message);
                requestMessage.edit(requestMessage.content, {
                    embed: await buildEmbedObject(request)
                });

                // Add mentor to the request channel
                requestChannel.permissionOverwrites.set(user.id, {
                    id: user.id,
                    allow: new Permissions(379968)
                });

                requestChannel.edit({
                    permissionOverwrites: requestChannel.permissionOverwrites
                });

                // Post message in help queue channel
                requestChannel.send(`<@!${user.id}> claimed this request!`, {
                    embed: await buildEmbedObject(request)
                });
            } else {
                const errorMessage = await helpQueueChannel.send(`you have already claimed this request!`, {
                    reply: user
                });
                errorMessage.delete({
                    timeout: 15000
                });
            }

            // Remove the user from the reaction
            return reaction.users.remove(user);
        }
        case "🟢": {
            // Complete request
            await completeRequest(request._id);
            request.status = "completed";
            request.time = Date.now();

            // Send completed help request to past channel
            pastHelpRequestsChannel.send("", {
                embed: await buildEmbedObject(request)
            });

            // Delete the message in the help queue
            reaction.message.delete();

            // Post message in help queue channel
            const requestChannel = await openLabBot.channels.fetch(request.channel);
            return requestChannel.send(`<@!${user.id}> completed this request!`, {
                embed: await buildEmbedObject(request)
            });
        }
        case "🔵": {
            const requestChannel = await openLabBot.channels.fetch(request.channel);

            if (request.mentors.includes(user.id)) {
                request.mentors.splice(request.mentors.indexOf(user.id), 1);

                const isStillClaimed = request.mentors.length > 0;

                // Unclaim request
                await unclaimRequest(request._id, user.id, isStillClaimed);
                request.status = isStillClaimed ? "claimed" : "unclaimed";
                request.time = Date.now();

                // Edit help queue message to reflect removed mentor
                const requestMessage = await helpQueueChannel.messages.fetch(request.message);
                requestMessage.edit(requestMessage.content, {
                    embed: await buildEmbedObject(request)
                });

                // Post message in help queue channel
                requestChannel.send(`<@!${user.id}> unclaimed this request!`, {
                    embed: await buildEmbedObject(request)
                });
            } else {
                const errorMessage = await helpQueueChannel.send(`you can't remove yourself from a request you haven't claimed. Perhaps you meant to claim it instead?`, {
                    reply: user
                });
                errorMessage.delete({
                    timeout: 15000
                });
            }

            // Remove the user from the reaction
            return reaction.users.remove(user);
        }
    }
}

function buildPermissionOverwrites(userId, everyoneId) {
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

    return permissions;
}

async function buildEmbedObject(request) {
    let embed = new MessageEmbed();

    const author = await helpQueueChannel.guild.members.fetch(request.author);
    const mentor = request.mentors.length > 0 ? await helpQueueChannel.guild.members.fetch(request.mentors[0]) : null;
    const canceler = request.canceler ? await helpQueueChannel.guild.members.fetch(request.canceler) : null;

    embed.setAuthor(author.displayName, author.user.avatarURL() || author.user.defaultAvatarURL);
    embed.setTitle(`[${request.class}] ${request.title}`);
    embed.setDescription(request.description);
    embed.setColor(statusColors[request.status]);
    embed.setTimestamp(request.time);

    if (request.status === "draft") {
        embed.setFooter("Draft", unclaimedImageURL);
    } else if (request.status === "unclaimed") {
        embed.setFooter("Unclaimed", unclaimedImageURL);
    } else if (request.status === "claimed") {
        embed.setFooter(`In progress by ${mentor.displayName}${request.mentors.length > 1 ? ` + ${request.mentors.length - 1}` : ""}`, mentor.user.avatarURL() || mentor.user.defaultAvatarURL);
    } else if (request.status === "completed") {
        embed.setFooter(`Completed by ${mentor.displayName}${request.mentors.length > 1 ? ` + ${request.mentors.length - 1}` : ""}`, mentor.user.avatarURL() || mentor.user.defaultAvatarURL);
    } else if (request.status === "canceled") {
        if (canceler) {
            embed.setFooter(`Canceled by ${canceler.displayName}`, canceler.user.avatarURL() || canceler.user.defaultAvatarURL);
        } else {
            embed.setFooter(`Canceled due to inactivity`, canceledImageURL);
        }
    }

    return embed;
}

async function getActiveRequestForUser(author) {
    return dbRequests.findOne({
        author: author,
        status: {
            "$in": ["draft", "unclaimed", "claimed"]
        }
    });
}

async function getRequestForChannel(channel) {
    return dbRequests.findOne({
        channel: channel
    });
}

async function getRequestForMessage(messageId) {
    return dbRequests.findOne({
        message: messageId
    });
}

async function createNewRequestDb(author, channel) {
    return dbRequests.insertOne({
        author: author,
        mentors: [],
        channel: channel,
        status: "draft",
        creationStage: 1,
        time: Date.now()
    });
}

async function updateRequestCreationStage(id, stage) {
    const update = {
        $set: {
            creationStage: stage
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

async function addClassName(id, className) {
    const update = {
        $set: {
            class: className
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

async function addTitle(id, title) {
    const update = {
        $set: {
            title: title
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

async function addDescription(id, description) {
    const update = {
        $set: {
            description: description
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

async function publishRequest(id, messageId) {
    const update = {
        $set: {
            status: "unclaimed",
            time: Date.now(),
            message: messageId
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

async function cancelRequest(id, cancelerId) {
    const update = {
        $set: {
            status: "canceled",
            time: Date.now(),
            canceler: cancelerId
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

async function claimRequest(id, mentorId) {
    const update = {
        $set: {
            status: "claimed",
            time: Date.now()
        },
        $push: {
            mentors: mentorId
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

async function unclaimRequest(id, mentorId, isStillClaimed) {
    const update = {
        $set: {
            status: isStillClaimed ? "claimed" : "unclaimed",
            time: Date.now()
        },
        $pull: {
            mentors: mentorId
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

async function completeRequest(id) {
    const update = {
        $set: {
            status: "completed",
            time: Date.now(),
        }
    }

    return await dbRequests.updateOne({ 
        _id: ObjectId(id)
    }, update);
}

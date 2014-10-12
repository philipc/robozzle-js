var robozzle = {
    sortKind: 1, /* Easy to hard */
    blockIndex: 0,
    blockSize: 64,
    pageIndex: 0,
    pageSize: 8,
    levels: null,
    levelCount: 1,
    hideSolved: false,
    userName: null,
    password: null,
    solvedLevels: {},
    votes: {}
};

robozzle.parseXML = function (node) {
    if (node.nodeType == 3) {
        return node.nodeValue.replace(/^\s+/,'').replace(/\s+$/,'');
    } else if (node.nodeType == 1) {
        var obj = {};
        for (var childNode = node.firstChild; childNode; childNode = childNode.nextSibling) {
            //console.log([childNode.nodeName, childNode.nodeType, childNode.namespaceURI]);
            var childVal = robozzle.parseXML(childNode);
            if (childNode.nodeType == 3) {
                return childVal;
            }
            var childName = childNode.localName;
            if (childNode.namespaceURI === 'http://schemas.microsoft.com/2003/10/Serialization/Arrays') {
                if (!$.isArray(obj)) {
                    obj = [];
                }
                obj.push(childVal);
            } else if (obj[childName]) {
                if (!$.isArray(obj[childName])) {
                    obj[childName] = [ obj[childName] ];
                }
                obj[childName].push(childVal);
            } else {
                obj[childName] = childVal;
            };
        }
        return obj;
    } else if (node.nodeType == 9) {
        var obj = robozzle.parseXML(node.documentElement);
        return obj;
    } else {
        return null;
    }
};

robozzle.service = function (method, data, success) {
    $.soap({
        url: '/RobozzleService.svc',
        appendMethodToURL: false,
        namespaceURL: 'http://tempuri.org/',
        SOAPAction: 'http://tempuri.org/IRobozzleService/' + method,
        method: method,
        data: data,
        success: function (soapResponse) {
            var response = robozzle.parseXML(soapResponse.toXML()).Body[method + 'Response'];
            success(response[method + 'Result'], response);
        }
    });
};

robozzle.topSolversResponse = function (table, solved, names) {
    for (var i = 0; i < solved.length; i++) {
        table.append(
            $('<tr/>').append(
                $('<td/>').addClass('solved').text(solved[i]),
                $('<td/>').append(
                    $('<a/>')
                        .text(names[i])
                        .attr('href', 'user.aspx?name=' + names[i])
                )
            )
        );
    }
};

robozzle.topSolvers = function () {
    robozzle.service('GetTopSolvers2', {}, function (result, response) {
        robozzle.topSolversResponse($('#topsolvers'),
                response.solved,
                response.names);
        robozzle.topSolversResponse($('#topsolverstoday'),
                response.solvedToday,
                response.namesToday);
        $('#scoreboard').show();
    });
};

robozzle.displayLevel = function (level) {
    var html = $('#templates .levelitem').clone();
    html.find('div.title').text(level.Title);
    if (level.DifficultyVoteCount != 0)
        var difficulty = Math.round(level.DifficultyVoteSum / level.DifficultyVoteCount * 100) / 100;
    else
        var difficulty = '-';
    html.find('span.difficulty').text(difficulty);
    html.find('a.stats').attr('href', 'puzzle.aspx?id=' + level.Id),
    html.find('a.comments')
        .text(level.CommentCount + ' comments')
        .attr('href', 'forums/thread.aspx?puzzle=' + level.Id);
    html.find('a.author')
        .text(level.SubmittedBy)
        .attr('href', 'user.aspx?name=' + level.SubmittedBy);
    html.find('span.liked').text('+' + level.Liked);
    html.find('span.disliked').text('-' + level.Disliked);
    if (robozzle.solvedLevels[level.Id.toString()]) {
        html.addClass('solved');
    }
    return html;
};

robozzle.displayLevels = function () {
    if (!robozzle.levels) {
        return;
    }
    var levellist = $('#levellist');
    levellist.empty();
    for (var i = 0; i < robozzle.pageSize; i++) {
        var index = robozzle.pageIndex + i;
        if (index < robozzle.levelCount) {
            var level = robozzle.levels[index - robozzle.blockIndex];
            levellist.append(robozzle.displayLevel(level));
        }
    }
    $('#pagecurrent').val(robozzle.pageIndex / robozzle.pageSize + 1);
    $('#pagemax').text(Math.floor((robozzle.levelCount + robozzle.pageSize - 1) / robozzle.pageSize));
};

robozzle.clampPageIndex = function () {
    if (robozzle.pageIndex < 0) {
        robozzle.pageIndex = 0;
    }
    if (robozzle.pageIndex >= robozzle.levelCount) {
        robozzle.pageIndex = robozzle.levelCount - 1;
    }
    robozzle.pageIndex = robozzle.pageIndex - (robozzle.pageIndex % robozzle.pageSize);
};

robozzle.getLevels = function (force) {
    // Check if we need to fetch levels
    robozzle.clampPageIndex();
    if (!force && robozzle.levels && robozzle.pageIndex >= robozzle.blockIndex
            && robozzle.pageIndex < robozzle.blockIndex + robozzle.blockSize) {
        robozzle.displayLevels();
        return;
    }

    // Hide levels and show spinner
    $('#levellist').hide();
    var spinner = new Spinner().spin($('#levellist-spinner')[0]);

    // Build the request
    robozzle.blockIndex = robozzle.pageIndex - (robozzle.pageIndex % robozzle.blockSize);
    var request = {
        blockIndex: robozzle.blockIndex / robozzle.blockSize,
        blockSize: robozzle.blockSize,
        sortKind: robozzle.sortKind,
        unsolvedByUser: null
    };
    if (robozzle.userName && robozzle.hideSolved) {
        request.unsolvedByUser = robozzle.userName;
    }

    // Send the request
    robozzle.service('GetLevelsPaged', request, function (result, response) {
        // Store the response
        robozzle.levelCount = parseInt(response.totalCount, 10);
        robozzle.levels = response.GetLevelsPagedResult.LevelInfo2;
        if (!$.isArray(robozzle.levels)) {
            // Handle only one level in the block
            robozzle.levels = [ robozzle.levels ];
        }

        // Update the display
        if (robozzle.blockIndex >= robozzle.levelCount) {
            robozzle.setPageIndex(robozzle.levelCount);
        } else {
            robozzle.displayLevels();
        }

        // Show the levels again
        spinner.stop();
        $('#levellist').show();
    });
};

robozzle.setPageIndex = function (index) {
    if (robozzle.pageIndex != index) {
        robozzle.pageIndex = index;
        robozzle.getLevels();
    }
};

robozzle.hashPassword = function (password) {
    var salt = '5A6fKpgSnXoMpxbcHcb7';
    return CryptoJS.SHA1(password + salt).toString();
};

robozzle.logIn = function (userName, password, callback) {
    // Build the request
    var hash = robozzle.hashPassword(password);
    var request = {
        userName: userName,
        password: hash
    };

    // Handle the response in a callback so it can be cancelled if needed
    var callbacks = $.Callbacks();
    callbacks.add(function (result, response) {
        if (result === 'true') {
            // Store the response
            robozzle.userName = userName;
            robozzle.password = hash;
            robozzle.solvedLevels = {};
            $.each(response.solvedLevels, function (index, value) {
                robozzle.solvedLevels[value] = true;
            });
            robozzle.votes = {};
            $.each(response.votes, function (index, value) {
                robozzle.votes[value.Levelid] = value;
            });

            // Update the display
            $('#menu-signin').hide();
            $('#menu-register').hide();
            $('#menu-user').text(robozzle.userName).show();
            $('#menu-signout').show();
            robozzle.displayLevels();
            callback(true);
        } else {
            callback(false);
        }
    });

    // Send the request
    robozzle.service('LogIn', request, function (result, response) {
        callbacks.fire(result, response).empty();
    });
    robozzle.logInCallbacks = callbacks;
};

robozzle.logInCancel = function () {
    robozzle.logInCallbacks.empty();
};

robozzle.logOut = function () {
    robozzle.userName = null;
    robozzle.password = null;
    robozzle.solvedLevels = {};
    robozzle.votes = {};

    $('#menu-signout').hide();
    $('#menu-user').text('').hide();
    $('#menu-register').show();
    $('#menu-signin').show();
    robozzle.displayLevels();
};

$(document).ready(function () {
    $('#pagefirst').click(function () {
        robozzle.setPageIndex(0);
    });
    $('#pageprev').click(function () {
        robozzle.setPageIndex(robozzle.pageIndex - robozzle.pageSize);
    });
    $('#pagenext').click(function () {
        robozzle.setPageIndex(robozzle.pageIndex + robozzle.pageSize);
    });
    $('#pagelast').click(function () {
        robozzle.setPageIndex(robozzle.levelCount);
    });
    $('#pagecurrent').change(function () {
        robozzle.setPageIndex(parseInt($(this).val()) * robozzle.pageSize - 1);
    });
    $('#refresh').click(function () {
        robozzle.getLevels(true);
    });
    $('#hidesolved').click(function () {
        robozzle.hideSolved = $(this).prop('checked');
        robozzle.getLevels(true);
    });

    robozzle.getLevels();
    robozzle.topSolvers();

    var signinForm;
    var signin = $('#dialog-signin').dialog({
        autoOpen: false,
        modal: true,
        buttons: [
            {
                id: 'dialog-signin-button',
                text: 'Sign in',
                click: function () {
                    signinForm.submit();
                }
            },
            {
                text: 'Cancel',
                click: function () {
                    signin.dialog('close');
                }
            }
        ],
        open: function () {
            $('#dialog-signin-button').prop('disabled', false);
            signin.find(':input').prop('disabled', false);
            signin.find('#signin-error').text('');
        },
        close: function () {
            robozzle.logInCancel();
            signin.find('input[name="password"]').val('')
        }
    });
    signinForm = signin.find('form').on('submit', function (event) {
        event.preventDefault();
        $('#dialog-signin-button').prop('disabled', true);
        signin.find(':input').prop('disabled', true);
        robozzle.logIn(
                signin.find('input[name="name"]').val(),
                signin.find('input[name="password"]').val(),
                function (result) {
                    $('#dialog-signin-button').prop('disabled', false);
                    signin.find(':input').prop('disabled', false);
                    if (result) {
                        signin.dialog('close');
                    } else {
                        signin.find('#signin-error').text('Invalid username/password');
                    }
                });
    });
    $('#menu-signin').on('click', function () {
        signin.dialog('open');
    });
    $('#menu-signout').on('click', robozzle.logOut);
});

// see https://www.npmjs.com/package/github-client
// and http://getbootstrap.com/css/ (styles for prettiness)
// and http://codemirror.net/ (text editor with syntax highlighting)
// and https://github.com/RubenVerborgh/N3.js (Turtle parser)


define(['jquery', 'github', 'N3', 'lib/codemirror',
    'addon/hint/show-hint', 'mode/turtle/turtle', 'hint/turtle-hint',
    'logger', 'addon/search/search', 'addon/search/searchcursor',
    'addon/selection/mark-selection', 'semanticUI/semantic'
  ],

  function($, Github, N3, CodeMirror, ShowHint, ModeTurtle, HintTurtle, logger, Search, SearchCursor, MarkSelection, SemanticUI) {

    // HTML elements ------------------------------------------------------------

    var menu = $("#menu");

    var inputElements = {
      username: $("#input-username"),
      password: $("#input-password"),
      owner: $("#input-owner"),
      repo: $("#input-repo"),
      branch: $("#input-branch"),
      file: $("#input-file"),
      contents: $("#input-contents"),
      message: $("#input-message"),
      load: $("#button-load"),
      save: $("#button-save"),
      fileDisp: $(".current-filename"),
      vowlLink: $("#webvowl-link"),
      ghLink: $("#github-link"),
      sparqlURL: $("#sparql-link")
    };

    var syntaxCheckElements = {
      checker: $("#syntax-check"),
      working: $("#syntax-check-working"),
      pending: $("#syntax-check-pending"),
      passed: $("#syntax-check-passed"),
      failed: $("#syntax-check-failed"),
      off: $("#syntax-check-off")
    };

    // Editor state -------------------------------------------------------------

    var isBinary = false;

    var gh, repo, branch, user;
    var currentFile;

    var state = {
      syntaxCheck: "pending",
      fileIsLoaded: false,
      gh: undefined,
      repo: undefined,
      branch: undefined,
      user: undefined,
      currentFile: undefined
    };

    var editor = CodeMirror.fromTextArea(inputElements.contents[0], {
      mode: "turtle",
      autofocus: false,
      lineNumbers: true,
      gutters: ["CodeMirror-linenumbers", "breakpoints"],
      extraKeys: {
        "Ctrl-Space": "autocomplete"
      }
    });

    // Initialization -----------------------------------------------------------

    editor.custom = {}; // to pass list of prefixes and names
    editor.custom.dynamicNames = {};
    editor.custom.prefixed = {};
    var dynamicNames = {};

    CodeMirror.commands.autocomplete = function(cm) {
      cm.showHint(cm, CodeMirror.hint.turtle, {
        test: "test"
      });
    };

    //Further information to help User-------------------------------------------

      $('.popup-show')
        .popup({
          inline: true,
          position: 'bottom left'
        });


    // Reenable input element (necessary for Firefox)
    for (var key in inputElements) {
      inputElements[key].prop("disabled", false);
    }

    // Prefill some fields for a quick example
    inputElements.owner.val("ahemaid");
    inputElements.repo.val("vocotest");
    inputElements.branch.val("master");

    // Github Interaction -------------------------------------------------------

    var loadFromGitHub = function() {
      var username = inputElements.username.val().trim();
      var ownername = inputElements.owner.val().trim();
      var password = inputElements.password.val().trim();
      var reponame = inputElements.repo.val().trim();
      var branchname = inputElements.branch.val().trim();

      document.getElementById('search-input').style.display = 'inline';
      if (state.fileIsLoaded) {
        logger.info("File already loaded.");

      } else {
        if (username != "") {
          gh = new Github({
            username: username,
            password: password
          });
        } else {
          gh = new Github({
            token: password
          });
        }

        user = gh.getUser();
        logger.debug("user", user);

        if (!user) {
          logger.warning("Not logged in.", username);
        }

        repo = gh.getRepo(ownername, reponame);
        branch = repo.getBranch(branchname);

        // TODO:
        // the next call is redundant: branch already contains list of files,
        // and this should not be "master" but the selected branch:
        var tree = repo.git.getTree("master", null)
          .done(function(tree) {
            for (var i = 0; i < tree.length; i++) {
              if (tree[i].path.endsWith(".ttl")) {
                var opt = tree[i].path;
                var el = document.createElement("option");
                el.textContent = opt;
                el.value = opt;
                inputElements.file.append(el);
              }
            }
            readFile();
          });

        inputElements.username.prop("disabled", true);
        inputElements.password.prop("disabled", true);
        inputElements.owner.prop("disabled", true);
        inputElements.repo.prop("disabled", true);
        inputElements.branch.prop("disabled", true);

        disableLoadButton();

        changeSyntaxCheckState("pending");
      }


      //Show new commit on github------------------------------------------------
      $.ajax({ //Initializing commit with last commit of repo by loading file
        type: 'GET',
        url: "https://api.github.com/repos/" + ownername + "/" + reponame + "/commits?Accept=application/vnd.github.v3+json",

        data: {
          get_param: 'value'
        },
        success: function(data) {
          currentCommit = data[0]['sha']; //Get commit's sha
          console.log(data[0]['sha']);
        }
      });

      setInterval(function() { //In every 10 seconds get last commit of repo and compare it with current commit of user
        $.ajax({
          type: 'GET',
          url: "https://api.github.com/repos/" + ownername + "/" + reponame + "/commits?Accept=application/vnd.github.v3+json",
          data: {
            get_param: 'value'
          },
          success: function(data) {
            if (data[0]['sha'] != currentCommit) {
              $('.ui.modal').modal({
                centered: false,
                blurring: true
              }).modal('show');
              currentCommit = data[0]['sha'];
            }
          }
        });
      }, 10000);
      //------------------------------------------------------------------------
    };


    var readFile = function() {
      var filename = inputElements.file.val()

      branch.read(filename, isBinary)
        .done(function(contents) {
          editor.setValue(contents.content);
          state.fileIsLoaded = true;
          displayCurrentFilename(filename);

          if (user) {
            enableSaveButton();
          }
        })
        .fail(function(err) {
          logger.error("Read from GitHub failed", err);
        });
      changeSyntaxCheckState("pending");
    };

    var storeToGitHub = function() {
      var filename = inputElements.file.val();
      var content = editor.getValue().trim();
      var message = inputElements.message.val().trim();
      if (message) {
        if (state.fileIsLoaded) {
          branch.write(filename, content, message, isBinary)
            .done(function() {
              logger.success("Saving to GitHub completed.")
            })
            .fail(function(err) {
              logger.error("Saving to GitHub failed.", err);
            });
        } else {
          logger.info("Nothing to save.");
        }
      } else {
        alert("Please, fill-in the commit message box, it cannot be empty...");
      }

    };

    // Display current filename -------------------------------------------------

    var displayCurrentFilename = function(filename) {
      var baseUri = "http://vowl.visualdataweb.org/webvowl/index.html#iri=https://raw.githubusercontent.com/";
      var ownername = inputElements.owner.val().trim();
      var reponame = inputElements.repo.val().trim();
      var branchname = inputElements.branch.val().trim();
      var specific = ownername + "/" + reponame + "/" + branchname;
      inputElements.fileDisp.html(filename)
      inputElements.vowlLink.removeAttr("href");
      inputElements.vowlLink.attr("href", baseUri + specific + "/" + filename);

      // external links //////////////////////////
      var githubURI = "https://github.com";
      inputElements.ghLink.attr("href", githubURI + "/" + ownername + "/" + reponame + "/");
      var sparqlProcessorURI = "../SparqlProcessor/sparql-processor.html";

      inputElements.sparqlURL.attr("href", sparqlProcessorURI + "#" + ownername + "/" + reponame + "/" + filename);
      $("#menu").show();
    };

    // "http://vowl.visualdataweb.org/webvowl/index.html#iri=https://raw.githubusercontent.com/mobivoc/mobivoc/master/"

    // Syntax Check -------------------------------------------------------------

    // Search in textArea--------------------------------------------------------

    var marked = [],
      markedPositions = [],
      lastPos = null,
      lastQuery = null;

    function unmark() { //editor.clearSelectedText();
      for (var i = 0; i < marked.length; ++i) marked[i].clear();
      marked.length = 0;
    }

    function search(select) {

      function select() {
        if (marked.length != 0) {
          var currentIndex = 0;

          $('#previous-btn').on("click", function() {
            editor.setSelection(marked[currentIndex - 1].find()['from'], marked[currentIndex - 1].find()['to']);
            editor.setCursor(marked[currentIndex].find()['from']);
            if (currentIndex == 0) {
              currentIndex = marked.length - 1;
            } else {
              currentIndex--;
            }
            document.getElementById('search-index').innerHTML = currentIndex.toString() + '/';
          });

          $('#next-btn').on("click", function() {
            editor.setSelection(marked[currentIndex].find()['from'], marked[currentIndex].find()['to']);
            editor.setCursor(marked[currentIndex].find()['from']);

            if (currentIndex == marked.length - 1) {
              currentIndex = 0;
            } else {
              currentIndex++;
            }
            document.getElementById('search-index').innerHTML = currentIndex.toString() + '/';

          });
        }
      }
      unmark();
      var text = document.getElementById("search-input").value;
      if (this.value != '') {
        for (var cursor = editor.getSearchCursor(text); cursor.findNext();) {
          marked.push(editor.markText(cursor.from(), cursor.to(), {
            className: "searched-key",
            clearOnEnter: true
          }));
          markedPositions.push({
            from: cursor.from(),
            to: cursor.to()
          });
        }
        document.getElementById('search-index').innerHTML = '0/';
        document.getElementById('search-total').innerHTML = marked.length;
        document.getElementById('search-count').style.display = 'inline-block';
        document.getElementById('next-btn').style.display = 'inline-block';
        document.getElementById('previous-btn').style.display = 'inline-block';
        select();
      }
    }

    $('#search-input').on("input", search);

    //Check the new commit and popup it--------------------------------------------------







    //-----------------------------------------------------------------------------

    var toggleChecking = function() {
      console.log("toggleChecking");
      if (state.syntaxCheck === "off") {
        console.log("-> pending");
        changeSyntaxCheckState("pending", undefined, true);
      } else {
        changeSyntaxCheckState("off");
        console.log("-> off");
      }
    };

    syntaxCheckElements.checker.on("click", toggleChecking);

    var makeMarker = function(errorMessage) {
      debugger
      var marker = document.createElement("div");
      marker.style.color = "#822";
      marker.innerHTML = "●";
      marker.title = errorMessage;
      return marker;
    };

    var splitIntoNamespaceAndName = function(s) {
      var lastHash = s.lastIndexOf("#");
      var lastSlash = s.lastIndexOf("/");
      var pos = Math.max(lastHash, lastSlash) + 1;

      return {
        namespace: s.substring(0, pos),
        name: s.substring(pos)
      };
    };

    var parserHandler = function(error, triple, prefixes) {
      if (error) {

        /* extract line Number, only consider the end of the string after "line" */
        var errorSubString = error.message.substr(error.message.indexOf("line") + 4);
        var errorLineNumber = parseInt(errorSubString) - 1;

        /* add background color, gutter + tooltip */
        var lastPos = null,
          lastQuery = null,
          marked = [];
        var text = this.value;
        for (var cursor = editor.getSearchCursor(text); cursor.findNext();)
          marked.push(editor.markText(cursor.from(), cursor.to(), {
            className: "styled-background"
          }));
        if (lastQuery != text) lastPos = null;
        var cursor = editor.getSearchCursor(text, lastPos || editor.getCursor());
        if (!cursor.findNext()) {
          cursor = editor.getSearchCursor(text);
        }
        editor.setSelection(cursor.from(), cursor.to());
        lastQuery = text;
        lastPos = cursor.to();

        editor.getDoc().addLineClass(errorLineNumber, "wrap", "ErrorLine-background");
        editor.setGutterMarker(errorLineNumber, "breakpoints", makeMarker(error.message));

        changeSyntaxCheckState("failed", error.message);
      } else if (triple) {
        var subjectSplit = splitIntoNamespaceAndName(triple.subject);
        var predicateSplit = splitIntoNamespaceAndName(triple.predicate);
        var objectSplit = splitIntoNamespaceAndName(triple.object);

        dynamicNames[subjectSplit.namespace] = dynamicNames[subjectSplit.namespace] || {};
        dynamicNames[subjectSplit.namespace][subjectSplit.name] = true;

        dynamicNames[predicateSplit.namespace] = dynamicNames[predicateSplit.namespace] || {};
        dynamicNames[predicateSplit.namespace][predicateSplit.name] = true;

        dynamicNames[objectSplit.namespace] = dynamicNames[objectSplit.namespace] || {};
        dynamicNames[objectSplit.namespace][objectSplit.name] = true;
      } else if (!triple) {
        changeSyntaxCheckState("passed");
        editor.custom.dynamicNames = dynamicNames;
      }

      if (prefixes) {
        editor.custom.prefixes = prefixes;
      }
    };

    var changeSyntaxCheckState = function(newState, error, force) {
      if (newState !== state.syntaxCheck && (state.syntaxCheck !== "off" || force === true)) {
        console.log("changeSyntaxCheckState", newState, error, force);
        syntaxCheckElements[state.syntaxCheck].hide();
        state.syntaxCheck = newState;

        if (newState === "failed") {
          var status = syntaxCheckElements[newState].find(".status")
          if (error) {
            if (error.startsWith("Syntax error:")) {
              status.html(" " + error);
            } else {
              status.html(" Syntax error: " + error);
            }
          } else {
            status.html(" Syntax check failed.")
          }
        }
        syntaxCheckElements[newState].show();
      }
    };

    var checkSyntax = function() {
      /* remove all previous errors  */
      /* TODO: IMPROVE EFFICIENCY */
      editor.eachLine(function(line) {
        editor.getDoc().removeLineClass(line, "wrap");
        editor.clearGutter("breakpoints");
      });

      var parser, content;
      if (state.fileIsLoaded) {
        content = editor.getValue();
        parser = N3.Parser();
        parser.parse(content, parserHandler);
      }
    };

    var checkForUpdates = function() {
      if (state.syntaxCheck === "pending" && state.fileIsLoaded) {
        changeSyntaxCheckState("working");
        checkSyntax();
      }
    };

    // Event listeners ----------------------------------------------------------
    inputElements.load.on("click", loadFromGitHub);
    inputElements.save.on("click", storeToGitHub);
    inputElements.file.on("change", readFile);

    editor.on("change", function() {
      changeSyntaxCheckState("pending");
    });


    // Repeated actions ---------------------------------------------------------

    window.setInterval(checkForUpdates, 1000);

    // Utility ------------------------------------------------------------------

    var disableLoadButton = function() {
      inputElements.load.removeClass("btn-primary");
      inputElements.load.addClass("btn-default");
      inputElements.load.prop("disabled", true);
    };

    var enableSaveButton = function() {
      inputElements.save.removeClass("btn-default");
      inputElements.save.addClass("btn-primary");
      inputElements.save.prop("disabled", false);
    };

    var disableSaveButton = function() {
      inputElements.save.addClass("btn-default");
      inputElements.save.removeClass("btn-primary");
      inputElements.save.prop("disabled", true);
    };

    // do it
    disableSaveButton();

    if (!String.prototype.endsWith) {
      String.prototype.endsWith = function(searchString, position) {
        var subjectString = this.toString();
        if (position === undefined || position > subjectString.length) {
          position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
      };
    }

    if (!String.prototype.startsWith) {
      String.prototype.startsWith = function(searchString, position) {
        position = position || 0;
        return this.indexOf(searchString, position) === position;
      };
    }
  });

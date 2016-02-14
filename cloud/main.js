var Parse = require('parse/node').Parse;

//SCORE SAVERS MOCK BACKEND

//Handle call for data exportation
Parse.Cloud.define("CheckForExport", function(request, response) {
	//lastExported WILL be locked before this is called, proceed with this assumption
	
	//check for actively logged in user, otherwise deny
	if(!request.user) {
		response.error("not authorized");
		return;
	}
	
	//utilize the master key so we can manipulate each of these objects regardless of who started this request
	Parse.Cloud.useMasterKey();
	
	var exportDate = request.params.exportDate;
	
	var TimeSheet = Parse.Object.extend("TimeSheet");
	var query = new Parse.Query(TimeSheet);
	query.equalTo("exported", false);
	query.include("user");
	//query.include("items");
	query.find({
		success: function(timeSheets) {
			var jsonObj = {};
			jsonObj.timesheets = [];
			
			if(timeSheets.length == 0) {
				response.error("No time sheets lined up for export.");
			} else {
				//start recursive data fetching
				fetchItems(0, timeSheets, jsonObj, exportDate, response);
			}
		},
		error: function(er) {
			response.error("Error thrown: " + er.message + "::" + er.code);
		}
	});
});

function fetchItems(index, array, json, exportDate, response) {
	json.timesheets[index] = array[index].toJSON();
	json.timesheets[index].user = array[index].get("user").toJSON();
	
	array[index].set("exported", true);
	array[index].save();
	
	var rel = array[index].relation("items");
	var query = rel.query();
	query.ascending("date");
	query.include("location");
	query.find({
		success: function(items) {
			if(items.length <= 0) {
				json.timesheets[index] = "";
				index++;
				if(index > array.length-1) {
					//maxed out	
					sendAwayJson(json, exportDate, response);
				} else {
					//continue
					fetchItems(index, array, json, exportDate, response);
				}
			} else {
				json.timesheets[index].items = [];
				iterateOverSubItems(0, array, items, json, exportDate, fetchItems, index, response);
			}
		},
		error: function(er) {
			response.error("Fetch Items Error>>"+er.message+"::"+er.code);
		}
	});	
}

function iterateOverSubItems(index, array, items, json, exportDate, callback, highIndex, response) {
	json.timesheets[highIndex].items[index] = items[index].toJSON();
	json.timesheets[highIndex].items[index].location = items[index].get("location").toJSON();
	
	var rel = items[index].relation("studentTypes");
	var query = rel.query();
	query.include("student");
	query.include("baseType");
	query.ascending("objectId");
	query.find({
		success: function(studentTypes) {
			json.timesheets[highIndex].items[index].studentTypes = [];
			for(var x = 0; x < studentTypes.length; x++) {
				json.timesheets[highIndex].items[index].studentTypes[x] = studentTypes[x].toJSON();
				json.timesheets[highIndex].items[index].studentTypes[x].student = studentTypes[x].get("student").toJSON();
				json.timesheets[highIndex].items[index].studentTypes[x].baseType = studentTypes[x].get("baseType").toJSON();
			}
			
			if(studentTypes.length <= 0){
				json.timesheets[highIndex].items[index].studentTypes = "";
			}
			
			index++;
			if(index > items.length-1) {
				//maxed out	go back up
				highIndex++;
				if(highIndex > array.length-1) {
					sendAwayJson(json,exportDate,response);
				} else {
					fetchItems(highIndex, array, json, exportDate, response);
				}
			} else {
				iterateOverSubItems(index, array, items, json, exportDate, callback, highIndex, response)
			}
		},
		error: function(er) {
			response.error("Error fetching studentTypes>>"+er.message+"::"+er.code);
		}
	});
}

function sendAwayJson(json, exportDate, response) {

	var Buffer = require('buffer').Buffer;

	var packedData = JSON.stringify(json);
	
	var mandrill = require('mandrill-api/mandrill');
	var mandrill_client = new mandrill.Mandrill('WbDGLNTkpHsqpJo7oYZlGw');	
	
	var buf64 = new Buffer( packedData, 'utf8');

	mandrill_client.messages.send({
	  message: {
		text: "Data export for the date of "+exportDate,
		subject: exportDate+" Data Export",
		from_email: "example@example.com", //TODO Replace this email with something better
		from_name: "Score Savers Exports",
		to: [
		  {
			email: "friedman.benjamin@gmail.com", //TODO Replace this email with kyle's desired email
			name: "Score Savers"
		  }
		],
		"attachments": [
			{
				"type": "text/plain",
				"name": exportDate+" export.txt",
				"content": buf64.toString('base64')
			}
		]
	  },
	  async: true
	},
	 function(httpResponse) {
		response.success("export success: "+httpResponse.message);
		
	  },
		function(httpResponse) {
		response.error("export failure: "+httpResponse.message);
		
	  });
}

//Allow a user to Increment,Decrement their account a given number of points
Parse.Cloud.define("UpdateStudentAccount", function(request, response) {

	if(!request.user) {
		response.error("Not authorized to update account.");
		return;
	}

	var dir = request.params.direction;
	var testID = request.params.testid;
	var stId = request.params.studtypeId;
	var keyword = request.params.keyword;
	
	//set which way we are setting hours
	var adjustment = -1;
	if(dir != 0) {
		adjustment = 1;
	}
	
	//use the master key
	Parse.Cloud.useMasterKey();
	
	//query for our test
	var Event = Parse.Object.extend("SATPrepTest");
	var q = new Parse.Query(Event);
	q.equalTo("objectId", testID);
	q.first({
		success: function(test) {
			//query for the students already on this test
			var rel = test.relation("students");
			var q2 = rel.query();
			q2.equalTo("objectId",stId);
			q2.first({
				success: function(stud) {
					if(stud && adjustment == 1) {
						//adding|removing, both are valid
						stud.increment(keyword, adjustment);
						stud.save({
							success: function(rez) {
								response.success("success updating student type");
							},
							error: function(mod,er) {
								response.error("Error applying updated student type: "+er);
							}
						});
					} else if(!stud && adjustment == -1) {
						var StudentType = Parse.Object.extend("StudentType");
						var q3 = new Parse.Query(StudentType);
						q3.equalTo("objectId",stId);
						q3.first({
							success: function(nStud) {
								console.log("WAS: "+nStud.get(keyword)+" and we will be bumping by:"+adjustment);
								nStud.increment(keyword, adjustment);
								console.log("updated with new count of:"+nStud.get(keyword)+" on "+nStud.id);
								nStud.save({
									success: function(rez) {
										response.success("success updating student type");
									},
									error: function(mod,er) {
										response.error("Error applying updated student type: "+er);
									}
								});
							},
							error: function(er) {
								response.error("Could not fetch a student reference to then update");
							}
						});
					} else {
						response.error("Invalid request.");
					}
				},
				error: function(mod,er) {
					response.error("Error fetching student type: "+er);
				}
			});
		},
		error: function(mod,er) {
			response.error("Error saving updated student type: "+er.message);
		}
	});
	
});

//Send a Generic email using the provided elements
Parse.Cloud.define("SendEmail", function(request, response) {
	//check for actively logged in user, otherwise deny
	if(!request.user) {
		response.error("not authorized");
		return;
	}
	var subject = request.params.subject;
	var msg = request.params.message;
	var fromEmail = request.params.fromEmail;
	var fromName = request.params.fromName;
	var toEmail = request.params.toEmail;
	var toName = request.params.toName;
	
	if(msg == null) {
		response.error("Msg is null");
		return;
	}
	if(fromEmail == null) {
		response.error("FromEmail is null");
		return;
	}	
	if(fromName == null) {
		response.error("FromName is null");
		return;
	}	
	if(subject == null) {
		response.error("subject is null");
		return;
	}
	if(toEmail == null) {
		response.error("toEmail is null");
		return;
	}
	if(toName == null) {
		response.error("toName is null");
		return;
	}
	
	
	var mandrill = require('mandrill-api/mandrill');
	var mandrill_client = new mandrill.Mandrill('WbDGLNTkpHsqpJo7oYZlGw');
	
	mandrill_client.messages.send({
	  message: {
		text: msg,
		subject: subject,
		from_email: fromEmail,
		from_name: fromName,
		to: [
		  {
			email: toEmail,
			name: toName
		  }
		]
	  },
	  async: true
	},
	function(httpResponse) {
		response.success("success: "+httpResponse.message);
		
	  },
	  function(httpResponse) {
		response.error("error: "+httpResponse.message);
		
	  });
});

//Send a Generic email using the provided elements
Parse.Cloud.define("SendHTMLEmail", function(request, response) {
	//check for actively logged in user, otherwise deny
	if(!request.user) {
		response.error("not authorized");
		return;
	}
	var subject = request.params.subject;
	var msg = request.params.message;
	var fromEmail = request.params.fromEmail;
	var fromName = request.params.fromName;
	var toEmail = request.params.toEmail;
	var toName = request.params.toName;
	
	if(msg == null) {
		response.error("Msg is null");
		return;
	}
	if(fromEmail == null) {
		response.error("FromEmail is null");
		return;
	}	
	if(fromName == null) {
		response.error("FromName is null");
		return;
	}	
	if(subject == null) {
		response.error("subject is null");
		return;
	}
	if(toEmail == null) {
		response.error("toEmail is null");
		return;
	}
	if(toName == null) {
		response.error("toName is null");
		return;
	}
	
	
	var mandrill = require('mandrill-api/mandrill');
	var mandrill_client = new mandrill.Mandrill('WbDGLNTkpHsqpJo7oYZlGw');
	
	mandrill_client.messages.send({
	  message: {
		html: msg,
		subject: subject,
		from_email: fromEmail,
		from_name: fromName,
		to: [
		  {
			email: toEmail,
			name: toName
		  }
		]
	  },
	  async: true
	},
	function(httpResponse) {
		response.success("success: "+httpResponse.message);
	  },
	  function(httpResponse) {
		response.error("error: "+httpResponse.message);
	  });
});